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

// POST /api/tags
// Body: { storagePath: string }
// Returns: { tags: string[] }
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

  // 1. Download file from Supabase Storage
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
  if (!text) {
    return NextResponse.json({ tags: [] });
  }

  // Use first 4000 chars — enough for classification
  const excerpt = text.slice(0, 4000);

  // 3. Ask AI for tags
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a document classification assistant. ' +
            'Given a document excerpt, return exactly 1 tag that best describes the main topic or domain (e.g. Finance, Biology, Law, Technology, Research, Tutorial). ' +
            'Rules: the tag is 1–3 words, Title Case, no punctuation, no hash symbols. ' +
            'Respond ONLY with a JSON array containing one string, e.g. ["Finance"].',
        },
        {
          role: 'user',
          content: `Classify this document:\n\n${excerpt}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 120,
    });

    const raw = response.choices[0]?.message?.content?.trim() ?? '[]';

    // Parse — strip any markdown code fences if present
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/,'').trim();
    let tags: string[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        tags = parsed
          .filter((t) => typeof t === 'string')
          .map((t: string) => t.trim())
          .filter((t) => t.length > 0)
          .slice(0, 1);
      }
    } catch {
      // Fallback: extract quoted strings
      const matches = raw.match(/"([^"]+)"/g);
      tags = matches ? matches.map((m) => m.replace(/"/g, '').trim()).slice(0, 8) : [];
    }

    return NextResponse.json({ tags });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Tag generation failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
