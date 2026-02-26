import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin, BUCKET_NAME } from '@/lib/supabase';
import { extractText } from '@/lib/extractText';

export const runtime = 'nodejs';
export const maxDuration = 60;

const client = new OpenAI({
  baseURL: 'https://models.inference.ai.azure.com',
  apiKey: process.env.GITHUB_TOKEN,
});

const MODEL = process.env.GITHUB_MODEL ?? 'gpt-4o-mini';

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[]; // ['A) ...', 'B) ...', 'C) ...', 'D) ...']
  answer: string;    // 'A' | 'B' | 'C' | 'D'
}

// POST /api/quiz
// Body: { storagePath: string }
// Generates 5 multiple-choice questions from the uploaded document.
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

  const truncated =
    text.length > 12000 ? text.slice(0, 12000) + '\n\n[...document truncated...]' : text;

  // 3. Generate quiz questions with AI
  const systemPrompt = `You are an expert quiz creator. Given a document, create exactly 5 multiple-choice questions that test comprehension of its key content.

Return ONLY valid JSON (no markdown fences, no extra text) in this exact format:
{
  "questions": [
    {
      "id": 1,
      "question": "Question text here?",
      "options": ["A) option one", "B) option two", "C) option three", "D) option four"],
      "answer": "A"
    }
  ]
}

Rules:
- Each question must have exactly 4 options labeled A) B) C) D)
- The "answer" field must be a single letter: A, B, C, or D
- Questions should cover different aspects of the document
- Make distractors plausible but clearly incorrect
- Do not include trivial or trick questions`;

  try {
    const response = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Generate 5 multiple-choice questions based on this document:\n\n${truncated}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 1200,
    });

    const raw = response.choices[0]?.message?.content ?? '';

    // Robustly parse: strip any accidental ```json fences
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: { questions: QuizQuestion[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: 'AI returned malformed quiz data. Please try again.' },
        { status: 500 }
      );
    }

    if (!Array.isArray(parsed?.questions) || parsed.questions.length === 0) {
      return NextResponse.json(
        { error: 'AI returned an empty question list. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ questions: parsed.questions });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: `Quiz generation failed: ${e instanceof Error ? e.message : 'unknown'}` },
      { status: 500 }
    );
  }
}
