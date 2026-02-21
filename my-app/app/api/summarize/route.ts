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

type SummaryLength = 'short' | 'medium' | 'long';

const LENGTH_CONFIG: Record<SummaryLength, { instruction: string; maxTokens: number }> = {
  short: {
    instruction:
      'Write a SHORT summary (around 150–200 words). Include: (1) one Overview sentence, ' +
      '(2) up to 3 Key Points as bullet points. Use markdown formatting.',
    maxTokens: 400,
  },
  medium: {
    instruction:
      'Write a MEDIUM-length summary (around 300–400 words). Include: (1) a short Overview paragraph, ' +
      '(2) Key Points as bullet points, (3) a brief Conclusion. Use markdown formatting.',
    maxTokens: 1024,
  },
  long: {
    instruction:
      'Write a DETAILED summary (around 600–800 words). Include: (1) an Overview paragraph, ' +
      '(2) an expanded Key Points section with explanations for each point, ' +
      '(3) Notable Details or Examples, (4) a Conclusion. Use markdown formatting.',
    maxTokens: 2048,
  },
};

// POST /api/summarize
// Body: { storagePath: string; length?: 'short' | 'medium' | 'long' }
export async function POST(req: NextRequest) {
  let body: { storagePath?: string; length?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { storagePath } = body;
  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath is required' }, { status: 400 });
  }

  const length: SummaryLength =
    body.length === 'short' || body.length === 'long' ? body.length : 'medium';

  // 1. Download the file bytes from Supabase Storage
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
    return NextResponse.json(
      {
        error:
          ext === 'pdf'
            ? 'No readable text found in this PDF. It may be a scanned image.'
            : 'The file appears to be empty.',
      },
      { status: 422 }
    );
  }

  // Truncate to avoid token limits
  const charLimit = length === 'long' ? 16000 : 12000;
  const truncated =
    text.length > charLimit ? text.slice(0, charLimit) + '\n\n[...document truncated...]' : text;

  // 3. Summarise with AI
  const { instruction, maxTokens } = LENGTH_CONFIG[length];
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a professional document analyst. ${instruction}`,
        },
        {
          role: 'user',
          content: `Please summarise the following document:\n\n${truncated}`,
        },
      ],
      temperature: 0.4,
      max_tokens: maxTokens,
    });

    const summary = response.choices[0]?.message?.content ?? '';
    return NextResponse.json({ summary });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `AI summarisation failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
