import { PDFParse } from 'pdf-parse';

/**
 * Extracts plain text from a Blob (PDF or TXT).
 * Returns `{ text }` on success, `{ error }` on failure.
 */
export async function extractText(
  fileData: Blob,
  ext: string
): Promise<{ text: string; error?: never } | { text?: never; error: string }> {
  try {
    if (ext === 'pdf') {
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const parser = new PDFParse({ data: buffer });
      const parsed = await parser.getText();
      await parser.destroy();
      return { text: parsed.text?.trim() ?? '' };
    } else if (ext === 'txt') {
      return { text: (await fileData.text()).trim() };
    } else {
      return { error: `Unsupported file type ".${ext}". Only PDF and TXT are supported.` };
    }
  } catch (e: unknown) {
    return { error: `Failed to extract text: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}
