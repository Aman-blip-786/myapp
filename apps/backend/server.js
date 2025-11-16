import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { google } from "googleapis";
import fs from "fs";
import Stripe from "stripe";
console.log("USING BACKEND FILE:", import.meta.url);

console.log("ENV CHECK:", {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "MISSING",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "MISSING",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "OK" : "MISSING",
  });
  
const app = express();
app.use(express.json());
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function generateAIReply(prompt) {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  const json = await resp.json();
  return json.choices[0].message.content;
}

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
    if (!code) return res.status(400).send("Missing code");

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.BACKEND_BASE_URL || "https://myapp-gw5z.onrender.com"}/oauth-gmail`
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: "me" });
    const email = profile.data.emailAddress;

    // Prepare row
    const row = {
      email,
      access_token: tokens.access_token || null,
      refresh_token: tokens.refresh_token || null,
      scope: tokens.scope || null,
      token_type: tokens.token_type || null,
      expiry_date: tokens.expiry_date || null,
      created_at: new Date().toISOString()
    };

    // Try upsert first (works if UNIQUE constraint exists)
    const upsertResp = await supabase.from("gmail_tokens").upsert(row, { onConflict: "email" });
    if (upsertResp.error) {
      console.warn("Upsert failed, will try insert/update fallback.", upsertResp.error);
      // Insert fallback
      const insertResp = await supabase.from("gmail_tokens").insert(row);
      if (insertResp.error) {
        // If insert fails because row exists, update instead
        console.warn("Insert fallback failed, attempting update.", insertResp.error);
        const updateResp = await supabase
          .from("gmail_tokens")
          .update({
            access_token: row.access_token,
            refresh_token: row.refresh_token,
            scope: row.scope,
            token_type: row.token_type,
            expiry_date: row.expiry_date,
          })
          .eq("email", email);

        if (updateResp.error) {
          console.error("Update fallback failed:", updateResp.error);
          return res.status(500).send("Error saving tokens (update fallback). Check logs.");
        } else {
          console.log("Updated tokens for", email);
        }
      } else {
        console.log("Inserted tokens for", email);
      }
    } else {
      console.log("Upserted tokens for", email);
    }

    return res.send("Gmail connected and token saved in Supabase!");
  } catch (error) {
    console.error("OAuth / token save error:", error);
    // If Supabase returned a structured error object, include it in response for debugging (safe only for dev)
    if (error?.message) return res.status(500).send(`OAuth error: ${error.message}`);
    return res.status(500).send("OAuth failed (see logs)");
  }
});

app.post("/analyze-scope", async (req, res) => {
  try {
    const { message_text, project_id } = req.body;

    let scope = "";
    if (project_id) {
      const { data: project } = await supabase
        .from("projects")
        .select("project_scope")
        .eq("id", project_id)
        .single();

      scope = project?.project_scope || "";
    }

    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a scope creep detector. Compare incoming client messages with the official project scope." },
          {
            role: "user",
            content: `
Project Scope:
${scope}

Client Message:
${message_text}

Return JSON with:
- is_out_of_scope (true/false)
- summary
- estimated_impact_hours
- suggested_price_increase
            `,
          },
        ],
        temperature: 0.2,
      }),
    }).then(r => r.json());

    const result = JSON.parse(completion.choices[0].message.content);

    const { error } = await supabase.from("scope_analysis").insert([
      {
        project_id,
        message_text,
        is_out_of_scope: result.is_out_of_scope,
        summary: result.summary,
        estimated_impact_hours: result.estimated_impact_hours,
        suggested_price_increase: result.suggested_price_increase,
      },
    ]);

    if (error) return res.status(400).json({ error: error.message });

    return res.json({ success: true, result });

  } catch (err) {
    console.error("Scope analyzer error:", err);
    res.status(500).json({ error: "Failed to analyze message" });
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

      const backendUrl = process.env.BACKEND_BASE_URL || "https://myapp-gw5z.onrender.com";
      await fetch(`${backendUrl}/analyze-scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: null,
          message_text: messageText,
        }),
      });

      console.log("Saved message:", subject);
    }
  } catch (err) {
    console.error("Poll Gmail error:", err);
  }
}


if (typeof pollGmail === "function") {
  setInterval(pollGmail, 60_000);
}

app.post("/assign-project", async (req, res) => {
  try {
    const { message_id, project_id } = req.body;

    // Update message row
    const { error: updateErr } = await supabase
      .from("client_messages")
      .update({ project_id })
      .eq("id", message_id);

    if (updateErr) return res.status(400).json({ error: updateErr.message });

    // Fetch message text for re-analysis
    const { data: msg } = await supabase
      .from("client_messages")
      .select("message_text")
      .eq("id", message_id)
      .single();

    // Re-run analysis
    await fetch(`${process.env.BACKEND_BASE_URL || "https://myapp-gw5z.onrender.com"}/analyze-scope`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id,
        message_text: msg.message_text,
      }),
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("Assign project error:", err);
    res.status(500).json({ error: "Failed to assign project" });
  }
});

app.post("/generate-proposal", async (req, res) => {
  try {
    const { message_id, project_id } = req.body;

    // Fetch message text
    const { data: msg } = await supabase
      .from("client_messages")
      .select("message_text")
      .eq("id", message_id)
      .single();

    // Fetch project scope
    const { data: project } = await supabase
      .from("projects")
      .select("project_scope, project_name")
      .eq("id", project_id)
      .single();

    // Call OpenAI to draft proposal
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You generate client proposals. Professional, concise, and clear deliverables."
          },
          {
            role: "user",
            content: `
Write a professional proposal update based on:

Project: ${project?.project_name}
Scope: ${project?.project_scope}
Client Request: ${msg?.message_text}

Include:
- Summary of new work
- Revised deliverables
- Estimated timeline extension
- Pricing section
- Approval sentence
            `
          }
        ],
        temperature: 0.2
      }),
    }).then(r => r.json());

    const proposalText = completion.choices[0].message.content;

    // Save to Supabase
    const { error } = await supabase
      .from("proposals")
      .insert([
        {
          message_id,
          project_id,
          proposal_text: proposalText,
        }
      ]);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true, proposal_text: proposalText });

  } catch (err) {
    console.error("Proposal generation error:", err);
    res.status(500).json({ error: "Failed to generate proposal" });
  }
});

app.post("/generate-invoice", async (req, res) => {
  try {
    const { message_id, project_id } = req.body;

    // Fetch message text
    const { data: msg } = await supabase
      .from("client_messages")
      .select("message_text, project_id")
      .eq("id", message_id)
      .single();

    // Fetch project details
    const { data: project } = await supabase
      .from("projects")
      .select("project_name, project_scope")
      .eq("id", project_id)
      .single();

    // --- AI ESTIMATION STEP ---
    const completion = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You generate invoice line items professionally and concisely."
          },
          {
            role: "user",
            content: `
Given:

Project Name: ${project?.project_name}
Scope: ${project?.project_scope}
Client Request: ${msg?.message_text}

Return a JSON with:
- description: text describing the work
- amount: price in INR (number only)
            `
          }
        ],
        temperature: 0.1
      }),
    }).then(r => r.json());

    const ai = JSON.parse(completion.choices[0].message.content);

    // Create customer (or use a default)
    const customer = await stripe.customers.create({
      name: project?.project_name || "Client",
    });

    // Create invoice item
    await stripe.invoiceItems.create({
      customer: customer.id,
      amount: Math.round(ai.amount * 100), // INR in paise
      currency: "inr",
      description: ai.description,
    });

    // Create draft invoice
    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: "send_invoice",
      days_until_due: 7,
    });

    // Save invoice metadata
    const { error } = await supabase
      .from("invoice_drafts")
      .insert([
        {
          message_id,
          project_id,
          stripe_invoice_id: invoice.id,
          stripe_invoice_url: invoice.hosted_invoice_url,
          amount: ai.amount,
          description: ai.description,
        }
      ]);

    if (error) return res.status(500).json({ error: error.message });

    res.json({
      success: true,
      invoice_url: invoice.hosted_invoice_url,
    });

  } catch (err) {
    console.error("Invoice generation error:", err);
    res.status(500).json({ error: "Failed to generate invoice" });
  }
});

app.post("/mark-reviewed", async (req, res) => {
  try {
    const { message_id } = req.body;

    const { error } = await supabase
      .from("client_messages")
      .update({ reviewed: true })
      .eq("id", message_id);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ success: true });
  } catch (err) {
    console.error("Mark reviewed error:", err);
    res.status(500).json({ error: "Failed to mark reviewed" });
  }
});

app.post("/generate-reply", async (req, res) => {
  try {
    const { message_id } = req.body;

    // 1. Load message
    const { data: msgData, error: msgErr } = await supabase
      .from("client_messages")
      .select("*")
      .eq("id", message_id)
      .single();

    if (msgErr) return res.status(400).json({ error: msgErr.message });

    // 2. Load project scope if available
    const { data: projectData } = await supabase
      .from("projects")
      .select("name, description, scope_text")
      .eq("id", msgData.project_id)
      .maybeSingle();

    // 3. Build prompt
    const prompt = `
You are an assistant helping a freelancer respond to client requests.

Client message:
${msgData.message_text}

Project scope:
${projectData?.scope_text || "No scope available"}

Write a polite, professional reply. Should be short, friendly, and actionable.
    `;

    // 4. Call OpenAI / GPT
    const replyText = await generateAIReply(prompt);

    // 5. Save reply in Supabase
    const { error: saveErr } = await supabase
      .from("email_replies")
      .insert([{ message_id, reply_text: replyText }]);

    if (saveErr) return res.status(400).json({ error: saveErr.message });

    res.json({ success: true, reply: replyText });

  } catch (e) {
    console.error("Reply generation failed:", e);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/send-email", async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: "Missing to/subject/body" });
    }

    // 1. Load refresh token
    const { data: tokenData, error: tokenErr } = await supabase
      .from("gmail_tokens")
      .select("refresh_token")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (tokenErr || !tokenData?.refresh_token) {
      return res.status(400).json({ error: "No Gmail refresh token found." });
    }

    // 2. Prepare OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://myapp-gw5z.onrender.com/oauth-gmail"
    );

    oauth2Client.setCredentials({
      refresh_token: tokenData.refresh_token,
    });

    // 3. Build Gmail API
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // 4. Create raw email (RFC 2822)
    const messageParts = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      body,
    ];

    const rawMessage = Buffer.from(messageParts.join("\n"))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

    // 5. Send email
    await gmail.users.messages.send({
      userId: "me",
      resource: {
        raw: rawMessage,
      },
    });

    res.json({ success: true });

  } catch (err) {
    console.error("Send email failed:", err);
    res.status(500).json({ error: "Failed to send email" });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log(`Server running on port ${process.env.PORT || 3001}`);
});
