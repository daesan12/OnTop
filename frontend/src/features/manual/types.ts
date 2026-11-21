import type { ReactElement } from "react";

export const manualGameIds = [
  "stone-rumble",
  "alkkagi",
  "gomoku",
  "farkle",
  "onecard",
  "bridge",
  "ledger",
  "rummikub",
  "halligalli",
  "janggi",
  "fishing",
  "fish-bread",
  "jump",
  "vr-jump",
  "rps-roulette",
  "plus-minus",
  "whack-a-mole",
  "speed-mole",
  "jump-rope",
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
  /** 코드로 그린 그림. 게임 화면과 같은 컴포넌트를 써서 외부 이미지 없이 그린다. */
  figure?: { caption: string; render: () => ReactElement };
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
