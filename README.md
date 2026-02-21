# AI Document Summary App

An AI-powered document management web application built with **Next.js 16**, **Supabase Storage**, and **GitHub Copilot Models (Azure OpenAI)**. Upload PDF or TXT files, get instant AI summaries, generate quizzes, and organise documents with AI-generated tags.

---

## Features

### Document Management
- Upload **PDF** and **TXT** files via drag-and-drop or file picker
- Preview PDFs inline and TXT files with syntax-preserved rendering
- Delete documents with confirmation modal
- Search documents by filename in real time

### AI Summary
- Generate AI summaries in three lengths: **Short** (150–200 words), **Medium** (300–400 words), **Long** (600–800 words)
- Formatted with Markdown (Overview, Key Points, Conclusion)
- Download summary as a `.md` file

### AI Quiz
- Auto-generate **5 multiple-choice questions** from the document
- Interactive answer selection with instant feedback
- Score display and retake functionality

### Tag / Category System
- AI automatically classifies each document into a **topic tag** (e.g. Finance, Biology, Technology)
- Tags are generated in the background on upload or file selection
- Click any tag to **filter** the document list
- Manually **add** or **remove** tags per document
- Re-generate AI tags with one click
- Tags are persisted in `localStorage` — survive page refreshes

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Storage | [Supabase Storage](https://supabase.com/docs/guides/storage) |
| AI Models | GitHub Copilot Models via Azure OpenAI (`gpt-4o-mini`) |
| PDF Parsing | `pdf-parse` |
| Deployment | [Vercel](https://vercel.com/) |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com/) project with a storage bucket
- A GitHub personal access token with access to [GitHub Models](https://github.com/marketplace/models)

### Installation

```bash
git clone https://github.com/fc-chan/ai-summary-app.git
cd ai-summary-app/my-app
npm install
```

### Environment Variables

Create a `.env.local` file in `my-app/`:

```env
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>
SUPABASE_BUCKET_NAME=<your-bucket-name>

GITHUB_TOKEN=<your-github-token>
GITHUB_MODEL=gpt-4o-mini   # optional, defaults to gpt-4o-mini
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

---

## API Routes

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/documents` | List all uploaded files |
| `POST` | `/api/documents` | Upload a new file |
| `GET` | `/api/documents/[id]` | Get a signed download URL |
| `DELETE` | `/api/documents/[id]` | Delete a file |
| `POST` | `/api/summarize` | Generate AI summary (`storagePath`, `length`) |
| `POST` | `/api/quiz` | Generate quiz questions (`storagePath`) |
| `POST` | `/api/tags` | Generate AI category tag (`storagePath`) |
| `GET` | `/api/health` | Health check |

---

## Project Structure

```
my-app/
├── app/
│   ├── page.tsx              # Main UI
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── documents/        # File CRUD
│       ├── summarize/        # AI summary
│       ├── quiz/             # AI quiz generation
│       ├── tags/             # AI tag generation
│       └── health/
├── components/
│   ├── ConfirmModal.tsx
│   ├── MarkdownRenderer.tsx
│   ├── PdfViewer.tsx
│   └── TagEditor.tsx
└── lib/
    ├── extractText.ts        # PDF / TXT text extraction
    └── supabase.ts           # Supabase client setup
```

---

## Deployment

The app is deployed on **Vercel**. Set the environment variables above in your Vercel project settings, then run:

```bash
vercel --prod
```
