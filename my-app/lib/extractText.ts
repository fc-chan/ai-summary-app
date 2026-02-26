import { extractText as pdfExtractText } from 'unpdf';

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
      const buffer = new Uint8Array(arrayBuffer);
      const { text } = await pdfExtractText(buffer, { mergePages: true });
      return { text: text?.trim() ?? '' };
    } else if (ext === 'txt') {
      return { text: (await fileData.text()).trim() };
    } else {
      return { error: `Unsupported file type ".${ext}". Only PDF and TXT are supported.` };
    }
  } catch (e: unknown) {
    return { error: `Failed to extract text: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}
