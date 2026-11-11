import rulesData from './filterRules.json'
/** Initial, reviewable dictionary. This is a word filter, not contextual moderation. */
const KOREAN_WORDS = rulesData.KOREAN_WORDS;
const INITIALS = rulesData.INITIALS;
const ENGLISH_WORDS = rulesData.ENGLISH_WORDS;

// Bound gaps so ordinary, distant words cannot be joined into a prohibited term.
const GAP = "[\\p{White_Space}\\p{P}\\p{S}\\p{Cf}0-9]{0,3}";
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const letters = (word: string) =>
  Array.from(word.normalize("NFKC"), escape).join(GAP);
const rules = [
  ...KOREAN_WORDS.map(
    (word) =>
      new RegExp(letters(word) + (word === "시발" ? "(?!점|역)" : ""), "gu"),
  ),
  // Abbreviations/English are matched as tokens, avoiding innocent substrings.
  ...INITIALS.map(
    (word) =>
      new RegExp(`(?<![\\p{L}\\p{N}])${letters(word)}(?![\\p{L}\\p{N}])`, "gu"),
  ),
  ...ENGLISH_WORDS.map(
    (word) => new RegExp(`(?<![a-z0-9])${letters(word)}(?![a-z0-9])`, "gu"),
  ),
];

/** Match normalized characters while preserving the visitor's original spacing/text. */
export function filterChat(text: string): string {
  text = text.normalize('NFC');
  let folded = "",
    offset = 0;
  const starts: number[] = [],
    ends: number[] = [];
  for (const character of text) {
    const normalized = character.normalize("NFKC").toLowerCase();
    folded += normalized;
    for (let i = 0; i < normalized.length; i++) {
      starts.push(offset);
      ends.push(offset + character.length);
    }
    offset += character.length;
  }
  const spans: { start: number; end: number }[] = [];
  for (const rule of rules) {
    for (const match of folded.matchAll(rule)) {
      spans.push({
        start: starts[match.index]!,
        end: ends[match.index + match[0].length - 1]!,
      });
    }
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: typeof spans = [];
  for (const span of spans) {
    const previous = merged.at(-1);
    if (previous && span.start < previous.end)
      previous.end = Math.max(previous.end, span.end);
    else merged.push({ ...span });
  }
  let result = "",
    cursor = 0;
  for (const span of merged) {
    result += text.slice(cursor, span.start) + "**";
    cursor = span.end;
  }
  return result + text.slice(cursor);
}
