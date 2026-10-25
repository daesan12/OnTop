export const manualGameIds = [
  "gomoku",
  "farkle",
  "onecard",
  "bridge",
  "janggi",
  "fishing",
  "fish-bread",
  "jump",
  "vr-jump",
] as const;
export type ManualGameId = (typeof manualGameIds)[number];
export type ManualCategory = "game" | "minigame" | "vr";
export type GuideId = "welcome" | "controls" | "join" | "watch" | "coins";
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
export interface RulebookPage {
  src: string;
  title: string;
  alt: string;
  note?: string;
}
export interface Rulebook {
  markdown: string;
  rulebookUrl: string;
  sections: ManualSection[];
  pages: RulebookPage[];
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
  sections: ManualSection[];
  rulebook?: Rulebook;
}
