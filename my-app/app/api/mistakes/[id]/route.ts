import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Mastery algorithm:
// - 3 consecutive correct answers → mastered = true → removed from active list
// - Any wrong answer → reset streak to 0, increment wrong_count
const MASTERY_THRESHOLD = 3;

// PATCH /api/mistakes/[id]
// Body: { correct: boolean }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: { correct?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.correct !== 'boolean') {
    return NextResponse.json({ error: '"correct" boolean is required' }, { status: 400 });
  }

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('mistake_book')
    .select('correct_streak, wrong_count')
    .eq('id', id)
    .single();

  if (fetchErr || !row) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 });
  }

  const newStreak = body.correct ? row.correct_streak + 1 : 0;
  const mastered = newStreak >= MASTERY_THRESHOLD;

  const updates: Record<string, unknown> = {
    correct_streak: newStreak,
    mastered,
    last_seen_at: new Date().toISOString(),
  };
  if (!body.correct) {
    updates.wrong_count = row.wrong_count + 1;
  }

  const { error: updateErr } = await supabaseAdmin
    .from('mistake_book')
    .update(updates)
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, mastered, newStreak, threshold: MASTERY_THRESHOLD });
}

// DELETE /api/mistakes/[id] — manually remove a question from the mistake book
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from('mistake_book').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
