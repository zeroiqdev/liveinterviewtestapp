# useladder — AI-Powered Interview Training Platform

useladder is an intelligent AI interview simulation and coaching platform. It helps job seekers practice realistic live technical and behavioral interviews with tailored AI interviewers, dynamic follow-up questioning, real-time speech evaluation, and curated role matches.

---

## Features

- **Interactive AI Interview Simulation**: Real-time audio and text-based mock interviews powered by Google Gemini and ElevenLabs/YarnGPT text-to-speech.
- **Dynamic Probing Engine**: Adapts questioning in real-time based on candidate responses, STAR method criteria, and technical depth.
- **Personalized Coaching & Feedback**: In-depth post-interview performance breakdowns analyzing vocabulary, technical depth, clarity, filler words, and actionable improvement tips.
- **Multi-Region Voice Support**: Realistic interview personas with natural voice synthesis supporting US, UK, and Nigerian accents.
- **Curated Job Matching & Discovery**: Explore vetted tech roles from top tech companies and YC startups matched to your career trajectory.

---

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, Turbopack)
- **Language**: TypeScript, React 19
- **Database**: MongoDB (Mongoose) for audio caching & user analytics
- **Storage**: Cloudflare R2 (S3-compatible persistent audio storage)
- **AI / LLM**: Google Gemini API (`@google/genai` / REST)
- **Text-to-Speech**: ElevenLabs & YarnGPT

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/your-username/liveinterviewtestapp.git
cd liveinterviewtestapp
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example environment file and fill in your API credentials:
```bash
cp .env.example .env.local
```

Key environment variables to configure in `.env.local`:
- `MONGODB_URI`: MongoDB connection string
- `GEMINI_API_KEY`: Google Gemini API key
- `ELEVENLABS_API_KEY`: ElevenLabs API key
- `YARNGPT_API_KEY`: YarnGPT API key (for Nigerian localized accents)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_DOMAIN`: Cloudflare R2 credentials

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

---

## Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint checks
- `npm run warm-tts-cache`: Pre-warm TTS audio cache across questions, personas, and regions
