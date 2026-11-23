import type { ManualGameId } from "./types";
import alkkagiThumbnail from "../../game/alkkagi/assets/thumbnail.webp";
import fruitDdaengThumbnail from "../../game/halligalli/assets/thumbnail.webp";
import ledgerThumbnail from "../../game/ledger/assets/thumbnail.webp";
import davinciThumbnail from "../../game/davinci/assets/cover.webp";
import fishBreadThumbnail from "../bungeoppang/assets/thumbnail.webp";
import rpsRouletteThumbnail from "../rpsRoulette/assets/thumbnail.webp";
import plusMinusThumbnail from "../plusMinus/assets/thumbnail.webp";
import moleThumbnail from "../mole/assets/thumbnail.webp";
import speedMoleThumbnail from "../speedMole/assets/thumbnail.webp";
import jumpRopeThumbnail from "../jumpRope/assets/thumbnail.webp";
import jumpThumbnail from "../jumpmap/assets/thumbnail.webp";

/** 게임 고르기 화면(태블릿·오락기)과 같은 대표 그림. 태블릿 그림은 public/art/tablet에 있다. */
const gameThumbnails: Partial<Record<ManualGameId, string>> = {
  davinci: davinciThumbnail,
  alkkagi: alkkagiThumbnail,
  quoridor: "/art/quoridor/thumbnail.webp",
  gomoku: "/art/tablet/omok.webp",
  farkle: "/art/tablet/dice-v2.webp",
  onecard: "/art/tablet/onecard-v2.webp",
  bridge: "/art/tablet/bridge-v2.webp",
  halligalli: fruitDdaengThumbnail,
  ledger: ledgerThumbnail,
  "fish-bread": fishBreadThumbnail,
  "rps-roulette": rpsRouletteThumbnail,
  "plus-minus": plusMinusThumbnail,
  "whack-a-mole": moleThumbnail,
  "speed-mole": speedMoleThumbnail,
  "jump-rope": jumpRopeThumbnail,
  jump: jumpThumbnail,
};

/** Local game illustrations: no external asset requests. */
export function BookIcon() {
  return (
    <svg viewBox="0 0 48 40" fill="none" aria-hidden="true">
      <path
        d="M24 9C17 3 8 3 3 6v27c8-2 15-1 21 4 6-5 13-6 21-4V6c-5-3-14-3-21 3Z"
        fill="currentColor"
        fillOpacity=".13"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M24 9v28M9 12c4-1 8 0 11 2m-11 5c4-1 8 0 11 2m8-7c3-2 7-3 11-2m-11 9c3-2 7-3 11-2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function GameArt({ game }: { game: ManualGameId }) {
  const thumbnail = gameThumbnails[game];
  if (thumbnail) return <img className={`manual-art art-${game}`} src={thumbnail} alt="" aria-hidden="true" style={{ objectFit: "cover" }} />;
  return (
      <svg
        className={`manual-art art-${game}`}
        viewBox="0 0 240 150"
        aria-hidden="true"
      >
        <rect
          width="240"
          height="150"
          fill={
            game === "janggi" ? "#c6ad83" : "#405f56"
          }
        />
        <circle cx="196" cy="28" r="70" fill="#f7e9c0" opacity=".08" />
        {game === "janggi" ? (
          <>
            <path
              d="M28 28h184v96H28ZM28 60h184M28 92h184M74 28v96m46-96v96m46-96v96M28 28l46 32m-46 0 46-32"
              fill="none"
              stroke="#826d49"
              strokeWidth="2"
            />
            {[
              { x: 85, y: 64, c: "楚" },
              { x: 154, y: 105, c: "漢" },
            ].map((p) => (
              <g key={p.c}>
                <circle cx={p.x} cy={p.y + 4} r="26" fill="#79552f" />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="26"
                  fill="#f1dfb6"
                  stroke="#a48351"
                  strokeWidth="3"
                />
                <text
                  x={p.x}
                  y={p.y + 10}
                  textAnchor="middle"
                  fill="#803c30"
                  fontSize="29"
                  fontFamily="serif"
                >
                  {p.c}
                </text>
              </g>
            ))}
          </>
        ) : game === "fishing" ? (
          <>
            <path
              d="M20 116q50-15 100 0t100 0M42 130q40-10 80 0t80 0"
              fill="none"
              stroke="#b2ccc0"
              opacity=".5"
            />
            <path
              d="M186 26Q136 10 114 78"
              fill="none"
              stroke="#d6b67d"
              strokeWidth="3"
            />
            <path d="M114 78v22" stroke="#f3e8c8" />
            <ellipse cx="114" cy="102" rx="10" ry="16" fill="#eee5cb" />
            <path d="M104 102a10 16 0 0 0 20 0" fill="#b95541" />
          </>
        ) : game === "vr-jump" ? (
          <>
            <path
              d="M58 61Q55 23 120 25t62 36"
              fill="none"
              stroke="#b3b7ac"
              strokeWidth="9"
            />
            <rect
              x="47"
              y="54"
              width="146"
              height="66"
              rx="25"
              fill="#eee8d6"
            />
            <path d="M64 70h112v28H64Z" fill="#2e403d" />
            <circle cx="91" cy="84" r="10" fill="#80ada9" />
            <circle cx="149" cy="84" r="10" fill="#80ada9" />
          </>
        ) : null}
      </svg>
    );
}
