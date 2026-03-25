/**
 * Fuzzy text matching for comparing spoken transcripts against expected line text.
 * Used to auto-advance rehearsal when the user speaks their line.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ')    // collapse whitespace
    .trim();
}

/**
 * Checks whether a spoken transcript matches an expected line of dialogue.
 *
 * Uses word overlap ratio: what fraction of the expected words appear
 * in the transcript. Works with partial transcripts since the user
 * doesn't need to say every word perfectly.
 *
 * @param transcript - The (partial) speech recognition transcript
 * @param expectedText - The full expected line text from the script
 * @param threshold - Minimum fraction of expected words that must appear (default 0.6)
 * @returns true if the transcript is close enough to the expected text
 */
export function isLineMatch(
  transcript: string,
  expectedText: string,
  threshold: number = 0.6
): boolean {
  const transcriptNorm = normalize(transcript);
  const expectedNorm = normalize(expectedText);

  if (!transcriptNorm || !expectedNorm) return false;

  const transcriptWords = transcriptNorm.split(' ');
  const expectedWords = expectedNorm.split(' ');

  // For very short lines (1-2 words), require a higher match ratio
  const effectiveThreshold = expectedWords.length <= 2 ? 0.8 : threshold;

  // Count how many expected words appear in the transcript
  const transcriptSet = new Set(transcriptWords);
  let matchCount = 0;
  for (const word of expectedWords) {
    if (transcriptSet.has(word)) {
      matchCount++;
    }
  }

  const ratio = matchCount / expectedWords.length;
  return ratio >= effectiveThreshold;
}
