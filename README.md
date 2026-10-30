# 🌱 HarvestHealth

A simple, mobile-friendly chat app that gives smallholder farmers practical, low-cost advice on **crops, livestock, and family health**. It answers in English, French, Hausa, Yoruba, or Igbo, and can look at photos of leaves, animals, or other problems.

It is powered by Claude (Anthropic).

---

## What's inside

```
harvesthealth/
├── package.json     # Project info and dependencies
├── .env.example     # Settings template (copy to .env)
├── server.js        # Backend: keeps your API key secret and talks to Claude
├── README.md
└── public/          # Frontend (what users see)
    ├── index.html
    ├── styles.css
    └── app.js
```

Your API key only lives on the server. Users' phones never see it.

---

## Run it on your computer

You need **Node.js 18 or newer** (download from https://nodejs.org).

1. Open a terminal in the `harvesthealth` folder.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Create your settings file:
   ```bash
   cp .env.example .env
   ```
   Open `.env` and replace `sk-ant-your-key-here` with your key from https://console.anthropic.com.
4. Start the app:
   ```bash
   npm start
   ```
5. Open http://localhost:3000 in your browser.

While you're building, `npm run dev` restarts the server automatically when you change a file.

---

## Put it online (Render, free tier)

1. Push this folder to a GitHub repository. Make sure `.env` is **not** included (add it to `.gitignore`).
2. On https://render.com, create a **New → Web Service** and connect the repo.
3. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
4. Under **Environment**, add `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, `MAX_TOKENS`).
5. Deploy. Render gives you a public link you can share.

Railway, Fly.io, or any host that runs Node.js works the same way.

---

## Settings (`.env`)

| Name | What it does | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your secret API key (required) | — |
| `ANTHROPIC_MODEL` | Which Claude model answers | `claude-sonnet-5-5` |
| `MAX_TOKENS` | Longest allowed reply | `1500` |
| `PORT` | Port the server uses | `3000` |

---

## Built-in protections

- **Photos are shrunk on the phone** before upload (max 1280px), which saves data on slow networks. Up to 3 photos per message.
- **Rate limit:** 20 messages per minute per user, to protect your API bill.
- **Input checks:** message length, photo type and size are validated on the server.
- **Only the last 20 messages** are sent with each request, keeping costs predictable.
- Conversations are saved in the user's own browser (without photos), so a page refresh doesn't lose the chat. "New chat" clears it.

---

## Changing how HarvestHealth behaves

The assistant's instructions (tone, languages, answer structure, safety rules) live in the `buildSystemPrompt()` function near the top of `server.js`. Edit that text and restart the server.

---

## Important

HarvestHealth gives general guidance only. It does not replace a doctor, veterinary officer, or agricultural extension officer. In any emergency, users should go to a clinic or hospital immediately — the app tells them this too.
