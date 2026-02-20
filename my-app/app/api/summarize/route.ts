import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { PDFParse } from 'pdf-parse';
import { supabaseAdmin, BUCKET_NAME } from '@/lib/supabase';

export const runtime = 'nodejs';

const client = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN,
});

const MODEL = process.env.GITHUB_MODEL ?? 'gpt-4o-mini';

// POST /api/summarize
// Body: { storagePath: string }
// Downloads the file from Supabase, extracts text (PDF or TXT), then summarises with AI.
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

  // 2. Extract text based on file type
  let text = '';
  try {
    if (ext === 'pdf') {
      // pdf-parse v2: class-based API, pass Buffer via { data: buffer }
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      text = parsed.text?.trim() ?? '';
    } else if (ext === 'txt') {
      text = (await fileData.text()).trim();
    } else {
      return NextResponse.json(
        { error: `Unsupported file type ".${ext}". Only PDF and TXT are supported.` },
        { status: 422 }
      );
    }
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Failed to extract text: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 422 }
    );
  }

  if (!text) {
    return NextResponse.json(
      { error: ext === 'pdf'
          ? 'No readable text found in this PDF. It may be a scanned image.'
          : 'The file appears to be empty.' },
      { status: 422 }
    );
  }

  // Truncate to avoid hitting token limits (~12,000 chars ≈ ~3k tokens)
  const truncated = text.length > 12000 ? text.slice(0, 12000) + '\n\n[...document truncated...]' : text;

  // 3. Summarise with GitHub Copilot Models
  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional document analyst. Summarise the provided document clearly and concisely. ' +
            'Structure your response with: (1) a short Overview paragraph, (2) Key Points as bullet points, ' +
            '(3) a brief Conclusion. Use markdown formatting.',
        },
        {
          role: 'user',
          content: `Please summarise the following document:\n\n${truncated}`,
        },
      ],
      temperature: 0.4,
      max_tokens: 1024,
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
