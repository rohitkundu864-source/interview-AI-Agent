# Interview AI Agent

A professional AI interview-practice app built with React + Vite and a Node/Express backend.

## Features
- Upload a resume as PDF, TXT, or Markdown
- AI-generated interview plan based on the resume
- Live chat-style interview with Gemini
- Company-style interview behavior: one question at a time, follow-ups, concise interviewer messages
- Interview stages: introduction, resume deep-dive, technical/role questions, behavioral questions, closing
- End-of-interview evaluation with strengths, improvement areas, and scores
- Clean professional dashboard UI
- Gemini API key stays on the server

## Setup

### 1. Server
```bash
cd server
npm install
copy .env.example .env
```

Open `.env` and set:
```env
GEMINI_API_KEY=YOUR_NEW_GEMINI_KEY
PORT=8787
```

Never commit `.env`.

### 2. Client
```bash
cd ../client
npm install
npm run dev
```

Open the URL shown by Vite, normally `http://localhost:5173`.

### 3. Start backend
In another terminal:
```bash
cd server
npm run dev
```

The client proxies `/api` to `http://localhost:8787`.

## Important
The API key included in your original message should not be placed into this project. Revoke it and create a new restricted key first.
