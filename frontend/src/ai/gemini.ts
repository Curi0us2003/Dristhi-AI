/**
 * Minimal browser-side client for the Gemini REST API.
 *
 * The app is a static export (no server runtime), so AI features call Gemini
 * directly from the browser. Configure with:
 *   NEXT_PUBLIC_GEMINI_API_KEY  – Google AI Studio key (falls back to the
 *                                 Firebase web API key if the Generative
 *                                 Language API is enabled on it)
 *   NEXT_PUBLIC_GEMINI_MODEL    – model id, default "gemini-2.5-flash"
 */

export type GeminiContent = {
  role: 'user' | 'model';
  parts: { text: string }[];
};

export const GEMINI_MODEL = process.env.NEXT_PUBLIC_GEMINI_MODEL || 'gemini-2.5-flash';

export function getGeminiApiKey(): string {
  return process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
}

export function getGeminiUrl(apiKey: string = getGeminiApiKey()): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
}

/** Sends a prompt to Gemini and returns the first candidate's text. */
export async function generateText(
  contents: GeminiContent[],
  generationConfig: Record<string, unknown> = {}
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error('No Gemini API key configured');

  const response = await fetch(getGeminiUrl(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents, generationConfig }),
  });
  if (!response.ok) {
    throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response');
  return text;
}
