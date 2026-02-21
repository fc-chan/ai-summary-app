import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, BUCKET_NAME } from '@/lib/supabase';

// ─── GET /api/documents ─────────────────────────────────────────────────────
// Returns a list of all files stored in the Supabase Storage bucket.
export async function GET() {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .list('', { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter out the placeholder .emptyFolderPlaceholder Supabase adds
  const files = (data ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder');

  return NextResponse.json({ files });
}

// ─── POST /api/documents ────────────────────────────────────────────────────
// Accepts multipart/form-data with a "file" field and uploads it to Supabase.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Sanitise the filename while preserving the original name
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = safeName;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error } = await supabaseAdmin.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    message: 'File uploaded successfully',
    path: storagePath,
    name: file.name,
    size: file.size,
    type: file.type,
  });
}
