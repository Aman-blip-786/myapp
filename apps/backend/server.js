import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
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
    if (!tokens.refresh_token) {
      return res.send("No refresh token received. Please revoke access and try again with prompt: 'consent'.");
    }
    fs.writeFileSync("gmail_token.json", JSON.stringify(tokens));
    res.send("Gmail connected!");
  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Error connecting Gmail");
  }
});

const seenMessageIds = new Set();

async function pollGmail() {
  try {
    if (!fs.existsSync("gmail_token.json")) {
      console.log("No Gmail token found, skipping poll");
      return;
    }

    const tokenData = JSON.parse(fs.readFileSync("gmail_token.json", "utf8"));
    if (!tokenData.refresh_token) {
      console.log("No refresh token in gmail_token.json");
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://myapp-gw5z.onrender.com/oauth-gmail"
    );
    oauth2Client.setCredentials({ refresh_token: tokenData.refresh_token });

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const { data: messagesList } = await gmail.users.messages.list({
      userId: "me",
      maxResults: 5,
      labelIds: ["INBOX"],
    });

    if (!messagesList.messages) return;

    for (const message of messagesList.messages) {
      if (seenMessageIds.has(message.id)) continue;
      seenMessageIds.add(message.id);

      try {
        const { data: messageData } = await gmail.users.messages.get({
          userId: "me",
          id: message.id,
        });

        const payload = messageData.payload;
        const headers = payload.headers || [];
        const subject = headers.find((h) => h.name === "Subject")?.value || "";
        const snippet = messageData.snippet || "";

        const messageText = `Subject: ${subject}\n${snippet}`;

        const { error } = await supabase.from("client_messages").insert([
          {
            project_id: null,
            message_text: messageText,
            source: "email",
          },
        ]);

        if (error) {
          console.error("Supabase insert error:", error);
          continue;
        }

        const backendUrl = process.env.BACKEND_BASE_URL || "https://myapp-gw5z.onrender.com";
        await fetch(`${backendUrl}/analyze-scope`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: null, message_text: messageText }),
        }).catch((err) => console.error("Analyze endpoint error:", err));
      } catch (err) {
        console.error(`Error processing message ${message.id}:`, err);
      }
    }
  } catch (error) {
    console.error("Poll Gmail error:", error);
  }
}

if (typeof pollGmail === "function") {
  setInterval(pollGmail, 60_000);
}

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
