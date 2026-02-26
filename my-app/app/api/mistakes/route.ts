import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export interface MistakeRecord {
  id: string;
  storage_path: string;
  file_name: string;
  question_id: number;
  question: string;
  options: string[];
  answer: string;
  wrong_count: number;
  correct_streak: number;
  mastered: boolean;
  last_seen_at: string;
  created_at: string;
}

// GET /api/mistakes
// Returns all non-mastered mistake records
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('mistake_book')
    .select('*')
    .eq('mastered', false)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ mistakes: data ?? [] });
}

// POST /api/mistakes
// Body: { questions: Array<{ storage_path, file_name, question_id, question, options, answer }> }
// Upsert wrong answers: new → insert; existing → increment wrong_count, reset streak
export async function POST(req: NextRequest) {
  let body: { questions?: Partial<MistakeRecord>[] };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { questions } = body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'questions array is required' }, { status: 400 });
  }

  for (const q of questions) {
    const { data: existing } = await supabaseAdmin
      .from('mistake_book')
      .select('id, wrong_count')
      .eq('storage_path', q.storage_path)
      .eq('question_id', q.question_id)
      .maybeSingle();

    if (existing) {
      await supabaseAdmin
        .from('mistake_book')
        .update({
          wrong_count: existing.wrong_count + 1,
          correct_streak: 0,
          mastered: false,
          last_seen_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabaseAdmin
        .from('mistake_book')
        .insert({
          storage_path: q.storage_path,
          file_name: q.file_name,
          question_id: q.question_id,
          question: q.question,
          options: q.options,
          answer: q.answer,
          wrong_count: 1,
          correct_streak: 0,
          mastered: false,
        });
    }
  }

  return NextResponse.json({ ok: true });
}
