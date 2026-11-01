export const manualGameIds = [
  "gomoku",
  "farkle",
  "onecard",
  "bridge",
  "ledger",
  "halligalli",
  "janggi",
  "fishing",
  "fish-bread",
  "jump",
  "vr-jump",
] as const;
export type ManualGameId = (typeof manualGameIds)[number];
export type ManualCategory = "game" | "minigame" | "vr";
export type GuideId =
  | "intro"
  | "welcome"
  | "controls"
  | "places"
  | "social"
  | "coins"
  | "join"
  | "watch"
  | "account"
  | "faq";
export type ManualPage = ManualGameId | GuideId | "catalog";
export function isManualGameId(value: unknown): value is ManualGameId {
  return manualGameIds.some((id) => id === value);
}
export interface ManualSection {
  id: string;
  title: string;
  markdown?: string;
  paragraphs?: string[];
  steps?: string[];
  table?: { headers: string[]; rows: string[][] };
  example?: { title: string; text: string };
  tip?: string;
}
export interface Rulebook {
  markdown: string;
  rulebookUrl: string;
  sections: ManualSection[];
}
export interface GameManual {
  status: "available" | "development";
  id: ManualGameId;
  category: ManualCategory;
  title: string;
  subtitle: string;
  keywords: string;
  players: string;
  goal: string;
  timing: string;
  summary: string;
  /** A round from start to finish, shown as numbered cards. */
  flow: { title: string; body: string }[];
  /** Key or button, then what it does. */
  keys?: [string, string][];
  /** Rules a first-time player most often misses. */
  points: string[];
  sections: ManualSection[];
  rulebook?: Rulebook;
}
