require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const SYSTEM_PROMPT = `You are HarvestHealth — a practical, respectful, and highly knowledgeable AI assistant focused on smallholder farming and family health across Africa, with special strength in West Africa.

Languages: Always reply in the exact language the user is writing in (English, French, Igbo, Yoruba, or Hausa). If the user mixes languages, match the main one. Be natural and clear.

Your mission: Give useful, low-cost, realistic advice that helps farmers improve their crops, livestock, and family health.

Rules you must follow:
- Be warm and respectful. Never talk down to the user.
- For any serious human health issue (especially children, pregnant women, high fever, severe diarrhea, vomiting, difficulty breathing, chest pain, etc.), clearly tell the user to go to a clinic or hospital immediately.
- When the user sends a photo, carefully describe what you see and base your advice on it.
- Structure every useful answer like this:
  1. Short understanding of the problem
  2. Immediate practical steps the user can take today
  3. Prevention advice
  4. When they should seek a real expert (clinic, vet, or agricultural officer)
- Prefer solutions that use local materials and low cost.
- If you are not sure, say so honestly.
- Never invent medicine names or claim to replace doctors or veterinary officers.

You understand common West African crops (maize, cassava, yam, rice, vegetables, cocoa, etc.), livestock (goats, sheep, poultry, cattle), and common health challenges in the region.`;

app.post("/api/chat", upload.single("image"), async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "GROQ_API_KEY is missing. Please add it to your .env file.",
      });
    }

    const userMessage = req.body.message || "";
    let history = [];
    try {
      history = req.body.history ? JSON.parse(req.body.history) : [];
    } catch (e) {
      history = [];
    }

    if (!userMessage && !req.file) {
      return res.status(400).json({ error: "Please type a message or send a photo." });
    }

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history,
    ];

    if (req.file) {
      const base64 = req.file.buffer.toString("base64");
      const mediaType = req.file.mimetype || "image/jpeg";

      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: userMessage || "Please look at this image and give practical advice related to farming or health.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:\( {mediaType};base64, \){base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: userMessage,
      });
    }

    const model = req.file ? "qwen/qwen3.8-27b" : "openai/gpt-oss-20b";

    const completion = await groq.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: 1200,
      temperature: 0.6,
    });

    const assistantReply =
      completion.choices[0]?.message?.content ||
      "Sorry, I could not generate a reply. Please try again.";

    res.json({
      reply: assistantReply,
      model: model,
    });
  } catch (error) {
    console.error("Groq error:", error?.message || error);
    res.status(500).json({
      error: error?.message || "Something went wrong. Please try again.",
    });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "HarvestHealth", provider: "Groq" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🌱 HarvestHealth is running at http://localhost:${PORT}`);
  console.log(`   Provider : Groq (Free tier)`);
  console.log(`   Make sure GROQ_API_KEY is set in .env\n`);
});