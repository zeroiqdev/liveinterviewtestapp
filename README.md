# get prepped — AI-Powered Interview Training Platform

get prepped is an intelligent AI interview simulation and coaching platform. It helps job seekers practice realistic live technical and behavioral interviews with tailored AI interviewers, dynamic follow-up questioning, real-time speech evaluation, and curated role matches.

---

## Features

- **Interactive AI Interview Simulation**: Real-time audio and text-based mock interviews powered by Google Gemini and ElevenLabs/YarnGPT/Azure text-to-speech.
- **Realtime Voice Interviews**: Speech-to-speech interviews over Azure Voice Live, through a WebSocket relay that keeps the Azure key server-side.
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
- **Text-to-Speech**: ElevenLabs, YarnGPT & Azure Speech
- **Realtime voice**: Azure Voice Live via `server/voiceLiveRelay.ts`
- **Auth**: signed JWT session cookie; Google sign-in, password, or emailed one-time code (Resend)

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

Key environment variables to configure in `.env.local` (see `.env.example` for the full list):
- `AUTH_SECRET` (**required**): random string of at least 32 characters for signing sessions (`openssl rand -base64 48`)
- `MONGODB_URI`: MongoDB connection string
- `RESEND_API_KEY`, `EMAIL_FROM`: send verification and password reset codes (in development, codes are printed to the server console when unset)
- `ADMIN_EMAILS`: comma-separated admin emails (admin rights apply once the address is verified)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`: Google sign-in
- `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`: Nigerian TTS voices and realtime voice interviews
- `GEMINI_API_KEY`: Google Gemini API key
- `ELEVENLABS_API_KEY`: ElevenLabs API key
- `YARNGPT_API_KEY`: YarnGPT API key (for Nigerian localized accents)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_DOMAIN`: Cloudflare R2 credentials

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

For realtime voice interviews (`/interview/realtime`), also run the relay:
```bash
npm run voice-relay
```

---

## Authentication

- **Log in** with a password, or with **Continue with Google** (the only passwordless option).
- **Sign-up** requires a password. It creates the account and emails a 6-digit verification code; no session is issued until the code is entered (`POST /api/auth/verify`; resend with `POST /api/auth/verify/resend`).
- **Forgot password**: `POST /api/auth/password/forgot` emails a reset code; `POST /api/auth/password/reset` with `{ email, code, password }` sets the new password and signs the user in. Accounts without a password (e.g. Google sign-ups) can use this to add one.
- Codes expire after 10 minutes, allow 5 attempts, are single use, and are bound to their purpose (a verification code can't reset a password).
- Resetting or changing a password signs out every other session for that account (`sessionsValidAfter` on the user).
- Login, sign-up, code sending and every paid API (LLM, TTS, realtime voice) are rate limited (`src/lib/rateLimit.ts`).
- Older accounts may still hold plain-text passwords. Hash them once with `npx tsx scripts/migrate-plaintext-passwords.ts --apply` (run without `--apply` for a dry run). Until then those users can use Forgot password.

---

## Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run start`: Start production server
- `npm run lint`: Run ESLint checks
- `npm test`: Run unit tests (`tests/`)
- `npm run typecheck`: TypeScript check
- `npm run voice-relay`: Start the realtime voice relay
- `npx tsx scripts/set-r2-cache-headers.ts [--apply]`: Add the long-lived cache header to audio clips uploaded before uploads set it (one-off; dry run without `--apply`)
- `npm run warm-tts-cache`: Pre-warm TTS audio cache across questions, personas, and regions
