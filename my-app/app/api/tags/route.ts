import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin, BUCKET_NAME } from '@/lib/supabase';
import { extractText } from '@/lib/extractText';

export const runtime = 'nodejs';

const client = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN,
});

const MODEL = process.env.GITHUB_MODEL ?? 'gpt-4o-mini';
const KEYWORDS_FILE = '__keywords__.json';

async function loadAll(): Promise<Record<string, string[]>> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_NAME).download(KEYWORDS_FILE);
  if (error || !data) return {};
  try { return JSON.parse(await data.text()); } catch { return {}; }
}

async function saveAll(map: Record<string, string[]>): Promise<void> {
  const blob = new Blob([JSON.stringify(map)], { type: 'application/json' });
  await supabaseAdmin.storage.from(BUCKET_NAME).upload(KEYWORDS_FILE, blob, { upsert: true });
}

// GET /api/tags  → return all saved keywords
export async function GET() {
  const keywords = await loadAll();
  return NextResponse.json({ keywords });
}

// POST /api/tags
// Body: { storagePath: string }
// Returns: { keywords: string[] }
export async function POST(req: NextRequest) {
  let body: { storagePath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storagePath } = body;
  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath is required' }, { status: 400 });
  }

  // 1. Download file
  const { data: fileData, error: downloadError } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .download(storagePath);

  if (downloadError || !fileData) {
    return NextResponse.json(
      { error: downloadError?.message ?? 'Failed to download file' },
      { status: 500 }
    );
  }

  const ext = storagePath.split('.').pop()?.toLowerCase() ?? '';

  // 2. Extract text
  const result = await extractText(fileData, ext);
  if (result.error !== undefined) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const text = result.text;
  if (!text) return NextResponse.json({ keywords: [] });

  const excerpt = text.slice(0, 4000);

  // 3. Ask AI for 3 keywords
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a document keyword extractor. ' +
            'Given a document excerpt, return exactly 3 keywords that best capture the core topics. ' +
            'Rules: each keyword is 1–3 words, Title Case, no punctuation, no hash symbols. ' +
            'Respond ONLY with a JSON array of exactly 3 strings, e.g. ["Machine Learning","Neural Networks","Data Science"].',
        },
        {
          role: 'user',
          content: `Extract 3 keywords from this document:\n\n${excerpt}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 80,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '[]';
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
    let keywords: string[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        keywords = parsed
          .filter((t) => typeof t === 'string')
          .map((t: string) => t.trim())
          .filter((t) => t.length > 0)
          .slice(0, 3);
      }
    } catch {
      const matches = raw.match(/"([^"]+)"/g);
      keywords = matches ? matches.map((m) => m.replace(/"/g, '').trim()).slice(0, 3) : [];
    }

    // Persist to Supabase
    if (keywords.length > 0) {
      const all = await loadAll();
      all[storagePath] = keywords;
      await saveAll(all);
    }

    return NextResponse.json({ keywords });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Keyword generation failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
