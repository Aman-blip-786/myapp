import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import fs from "fs";
console.log("USING BACKEND FILE:", import.meta.url);

console.log("ENV CHECK:", {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "MISSING",
  });
  
const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.get("/", (req, res) => {
  res.json({ message: "Backend is running!" });
});

app.post("/ingest", async (req, res) => {
  const { project_id, message_text, source } = req.body;
  const { error } = await supabase
    .from("client_messages")
    .insert([{ project_id, message_text, source }]);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ success: true });
});

app.post("/gmail-webhook", async (req, res) => {
  const sender = req.body.from || req.body.sender || "";
  const messageText = req.body.body || req.body.snippet || req.body.text || "";
  await supabase
    .from("client_messages")
    .insert([{ message_text: messageText, source: sender }]);
  res.json({ success: true });
});

app.get("/gmail/auth-url", (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    "https://myapp-gw5z.onrender.com/oauth-gmail"
  );
  const url = oauth2Client.generateAuthUrl({
    scope: ["https://www.googleapis.com/auth/gmail.readonly"],
    access_type: "offline",
    prompt: "consent",
  });
  res.json({ url });
});

app.get("/oauth-gmail", async (req, res) => {
  try {
    const code = req.query.code;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://myapp-gw5z.onrender.com/oauth-gmail"
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get user email
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;

    // Save tokens into Supabase
    const { error } = await supabase.from("gmail_tokens").upsert(
      {
        email,
        access_token: tokens.access_token || null,
        refresh_token: tokens.refresh_token || null,
        scope: tokens.scope || null,
        token_type: tokens.token_type || null,
        expiry_date: tokens.expiry_date || null,
      },
      { onConflict: "email" }
    );

    if (error) {
      console.error("Supabase OAuth save error:", error);
      return res.status(500).send("Error saving tokens.");
    }

    res.send("Gmail connected and token saved in Supabase!");
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("OAuth failed");
  }
});


const seenMessageIds = new Set();

async function pollGmail() {
  try {
    console.log("Polling Gmail...");

    // Get tokens from Supabase
    const { data: tokens, error } = await supabase
      .from("gmail_tokens")
      .select("*")
      .single();

    if (error || !tokens) {
      console.log("No Gmail tokens found in Supabase.");
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://myapp-gw5z.onrender.com/oauth-gmail"
    );

    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const { data: messagesList } = await gmail.users.messages.list({
      userId: "me",
      maxResults: 5,
      labelIds: ["INBOX"],
    });

    if (!messagesList.messages) {
      console.log("No messages.");
      return;
    }

    for (const msg of messagesList.messages) {
      if (seenMessageIds.has(msg.id)) continue;
      seenMessageIds.add(msg.id);

      const { data: msgData } = await gmail.users.messages.get({
        userId: "me",
        id: msg.id,
      });

      const subject =
        msgData.payload.headers.find((h) => h.name === "Subject")?.value || "";
      const snippet = msgData.snippet || "";

      const messageText = `Subject: ${subject}\n${snippet}`;

      await supabase.from("client_messages").insert([
        { project_id: null, message_text: messageText, source: "email" },
      ]);

      console.log("Saved message:", subject);
    }
  } catch (err) {
    console.error("Poll Gmail error:", err);
  }
}


if (typeof pollGmail === "function") {
  setInterval(pollGmail, 60_000);
}

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
