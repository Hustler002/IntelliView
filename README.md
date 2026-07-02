# IntelliView

> Practice the interview as if you already had the job description.

AI-powered mock interview platform. Upload your resume and a job description — get tailored HR, technical, and behavioral questions. Record your answers by voice, and receive scored evaluation with actionable improvement feedback.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| **Auth** | NextAuth v4 (credentials + Google OAuth), JWT sessions |
| **Database** | MongoDB + Mongoose |
| **Job Queue** | Redis + BullMQ (async parsing, evaluation) |
| **File Storage** | AWS S3 (AES-256 encrypted at rest) |
| **LLM** | Provider-selectable: OpenAI GPT-4o or Google Gemini 1.5 Flash |
| **Testing** | Vitest (unit), Playwright (E2E — future) |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or Upstash)
- AWS S3 bucket (for resume storage)
- OpenAI or Gemini API key

### Setup

```bash
# 1. Clone and install
git clone <your-repo-url>
cd IntelliView

# 2. Install Next.js app dependencies
npm install

# 3. Install worker server dependencies
cd server && npm install && cd ..

# 4. Configure environment
cp .env.example .env.local
# Edit .env.local with your credentials

# 5. Start development
npm run dev          # Next.js app on :3000 (terminal 1)
cd server && npm run dev   # Worker server on :4000 (terminal 2)
```

### Environment Variables

See [.env.example](.env.example) for all required and optional variables.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│   Next.js App    │     │  Worker Server   │
│   (Port 3000)    │     │  (Port 4000)     │
│                  │     │                  │
│  • Auth (NextAuth│     │  • parseResume   │
│  • Upload API    │────▶│  • parseJD       │
│  • Status API    │     │  • (future:      │
│  • UI Pages      │     │    evaluation)   │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
    ┌─────────┐           ┌──────────────┐
    │  Redis  │◀─────────▶│   MongoDB    │
    │ (BullMQ)│           │  (Mongoose)  │
    └─────────┘           └──────────────┘
         │
         ▼
    ┌─────────┐
    │  AWS S3 │
    │ (files) │
    └─────────┘
```

**Key design decision:** The Next.js app and Express worker server are separate processes sharing MongoDB + Redis. Upload requests enqueue BullMQ jobs; workers process them asynchronously. This keeps the web server responsive and allows independent scaling of workers.

## Project Structure

```
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, register (public)
│   │   ├── (protected)/      # Dashboard, upload, interview (authed)
│   │   └── api/              # Route handlers
│   ├── components/
│   │   ├── ui/               # Button, ProgressSteps
│   │   ├── upload/           # ResumeDropzone, JDInput
│   │   └── providers/        # SessionProvider
│   ├── lib/
│   │   ├── auth.ts           # NextAuth config
│   │   ├── s3.ts             # S3 client
│   │   ├── queue.ts          # BullMQ queues
│   │   └── db/               # Mongoose connection + models
│   ├── middleware.ts          # Route protection
│   └── types/                # TypeScript augmentations
├── server/
│   └── src/
│       ├── index.ts          # Express + worker entry
│       ├── workers/          # parseResume, parseJD
│       └── lib/              # LLM client, DB, models
├── __tests__/                # Vitest unit tests
└── .env.example              # Environment template
```

## Data Retention Policy

- **Resume files**: Stored in S3 with AES-256 encryption. A cleanup job (to be implemented) will delete raw uploads after 30 days.
- **Audio recordings** (future): Deleted after evaluation is complete and transcript is stored.
- **Parsed data**: Retained indefinitely for session history and progress tracking.

## Module Status

- [x] **Module 1A** — Auth, Upload, Parsing Workers, Waiting Screen
- [ ] **Module 1B** — Question Generation
- [ ] **Module 2** — Voice Recording + STT + Evaluation
- [ ] **Module 3** — Results Dashboard + Scoring
- [ ] **Module 4** — Session History + Progress Tracking

## Production Hardening (Future)

- Virus-scanning uploaded files (ClamAV or cloud service)
- S3 bucket policies (private access, pre-signed URLs only)
- Rate limiting on `/api/upload` (5 uploads/user/hour)
- CSRF protection verification on upload routes
- File retention cron job implementation

## License

Private — portfolio project.
