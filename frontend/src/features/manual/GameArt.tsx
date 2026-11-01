import type { ManualGameId } from "./types";
import { RpsRouletteArt } from "../rpsRoulette/manualArt";

/** Original vector thumbnails: no external images, logos, fonts or requests. */
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
  if (game === "rps-roulette") return <RpsRouletteArt />;
  if (["janggi", "fishing", "fish-bread", "jump", "vr-jump"].includes(game))
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
            game === "janggi" || game === "fish-bread" ? "#c6ad83" : "#405f56"
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
        ) : game === "fish-bread" ? (
          <>
            <path
              d="M42 80Q85 29 154 66l37-22-4 36 8 32-41-17Q85 137 42 80Z"
              fill="#dd9b46"
              stroke="#94612d"
              strokeWidth="4"
            />
            <circle cx="66" cy="75" r="4" fill="#684025" />
            <path
              d="m93 60 32 38m-16-42 31 36m-45 8 34-38m-19 43 34-36"
              stroke="#b77732"
              strokeWidth="3"
            />
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
        ) : (
          <>
            <path
              d="m32 123 38-10 30 8-38 11Zm65-34 38-10 30 8-38 11Zm50-34 38-10 30 8-38 11Z"
              fill="#c9c5ae"
              stroke="#ece5cb"
              strokeWidth="2"
            />
            <path
              d="m32 123 30 9 38-11v10l-38 11-30-9Zm65-34 30 9 38-11v10l-38 11-30-9Zm50-34 30 9 38-11v10l-38 11-30-9Z"
              fill="#8c9789"
            />
          </>
        )}
      </svg>
    );
  return (
    <svg
      className={`manual-art art-${game}`}
      viewBox="0 0 320 180"
      aria-hidden="true"
    >
      <rect
        width="320"
        height="180"
        fill={
          game === "gomoku"
            ? "#bba382"
            : game === "onecard"
              ? "#4d665b"
              : game === "farkle"
                ? "#44584b"
                : game === "ledger"
                  ? "#5b5140"
                  : "#6c9390"
        }
      />
      <circle cx="289" cy="24" r="80" fill="#ead7a7" opacity=".08" />
      <circle cx="30" cy="195" r="100" fill="#102f25" opacity=".12" />
      {game === "gomoku" && (
        <g transform="translate(160 90) rotate(-12)">
          <rect
            x="-109"
            y="-85"
            width="218"
            height="170"
            rx="8"
            fill="#8a6541"
          />
          <rect
            x="-105"
            y="-89"
            width="210"
            height="166"
            rx="6"
            fill="#d9b985"
          />
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} stroke="#916c44" strokeWidth=".8">
              <path d={`M${-88 + i * 22} -72v132`} />
              <path d={`M-88 ${-72 + i * 16.5}h176`} />
            </g>
          ))}
          {[
            [-44, -6],
            [-22, -6],
            [0, -6],
            [22, -6],
            [44, -6],
          ].map(([x, y], i) => (
            <g key={i}>
              <ellipse
                cx={x + 1}
                cy={y + 3}
                rx="10"
                ry="9"
                fill="#765739"
                opacity=".3"
              />
              <circle cx={x} cy={y} r="9" fill="#25302a" />
              <circle cx={x - 3} cy={y - 3} r="3" fill="#7e8477" opacity=".7" />
            </g>
          ))}
          {[
            [-22, 10],
            [22, 10],
            [0, -22],
            [44, 27],
          ].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x + 1} cy={y + 2} r="9" fill="#b39c77" />
              <circle cx={x} cy={y} r="9" fill="#fbf4df" />
            </g>
          ))}
        </g>
      )}
      {game === "onecard" && (
        <g transform="translate(160 101)">
          <g transform="rotate(-22)">
            <rect
              x="-82"
              y="-70"
              width="86"
              height="125"
              rx="7"
              fill="#172e26"
              opacity=".25"
              transform="translate(3 5)"
            />
            <rect
              x="-82"
              y="-70"
              width="86"
              height="125"
              rx="7"
              fill="#e8dfc5"
            />
            <rect
              x="-74"
              y="-62"
              width="70"
              height="109"
              rx="3"
              fill="#a75d4d"
            />
            <path
              d="M-66-48-12 33m-54 0 54-81m-54 40h54"
              stroke="#e5bea1"
              opacity=".65"
              strokeWidth="2"
            />
          </g>
          <g transform="rotate(13)">
            <rect
              x="-30"
              y="-75"
              width="90"
              height="130"
              rx="7"
              fill="#18382c"
              opacity=".2"
              transform="translate(3 5)"
            />
            <rect
              x="-30"
              y="-75"
              width="90"
              height="130"
              rx="7"
              fill="#fbf5e6"
            />
            <text
              x="-19"
              y="-48"
              fill="#a34436"
              fontSize="22"
              fontFamily="Georgia"
            >
              7
            </text>
            <text
              x="15"
              y="17"
              textAnchor="middle"
              fill="#a34436"
              fontSize="57"
            >
              ♥
            </text>
          </g>
          <g transform="translate(83 44)">
            <circle r="20" fill="#c9a667" />
            <text
              textAnchor="middle"
              y="7"
              fill="#fff8e5"
              fontSize="21"
              fontWeight="bold"
            >
              1
            </text>
          </g>
        </g>
      )}
      {game === "farkle" && (
        <g>
          <path d="M50 35q32-16 63 0l-7 100q-24 18-49 0Z" fill="#9a6d44" />
          <ellipse cx="81" cy="35" rx="32" ry="12" fill="#c49a69" />
          <ellipse cx="81" cy="35" rx="24" ry="8" fill="#61442f" />
          <path
            d="m60 59 43 0m-42 9h41M62 118h37"
            stroke="#d0ab77"
            strokeWidth="2"
            opacity=".6"
          />
          {[
            [151, 64, -14, 1],
            [220, 52, 14, 5],
            [189, 124, 8, 3],
          ].map(([x, y, angle, value], i) => (
            <g key={i} transform={`translate(${x} ${y}) rotate(${angle})`}>
              <rect
                x="-25"
                y="-21"
                width="54"
                height="54"
                rx="8"
                fill="#243c31"
                opacity=".3"
              />
              <rect
                x="-27"
                y="-27"
                width="54"
                height="54"
                rx="8"
                fill="#f2e9d3"
              />
              <rect
                x="-24"
                y="-24"
                width="48"
                height="48"
                rx="6"
                fill="none"
                stroke="#d8c7a4"
              />
              {(value === 1
                ? [[0, 0]]
                : value === 3
                  ? [
                      [-12, -12],
                      [0, 0],
                      [12, 12],
                    ]
                  : [
                      [-12, -12],
                      [12, -12],
                      [0, 0],
                      [-12, 12],
                      [12, 12],
                    ]
              ).map(([dx, dy], j) => (
                <circle key={j} cx={dx} cy={dy} r="4" fill="#37433a" />
              ))}
            </g>
          ))}
        </g>
      )}
      {game === "bridge" && (
        <g>
          <path
            d="M-5 150Q38 109 15 44L0 0h60q-15 50 10 73t-2 107H0m255-180q-28 54 8 84t-5 96h64V0"
            fill="#405c47"
          />
          <path
            d="M38 127Q154 148 286 55M48 136Q156 157 294 65"
            stroke="#d4e2cb"
            strokeWidth="2"
            opacity=".25"
            fill="none"
          />
          <g transform="translate(55 106) rotate(-16)">
            <path d="M-3-25h220v58H-3Z" fill="#354638" opacity=".3" />
            {Array.from({ length: 8 }, (_, i) => (
              <g key={i}>
                <rect
                  x={i * 27}
                  y="-25"
                  width="24"
                  height="49"
                  rx="3"
                  fill={i % 2 ? "#c9ac77" : "#d8bc89"}
                />
                <path
                  d={`M${i * 27 + 7}-20v36`}
                  stroke="#a98c5a"
                  strokeWidth="1"
                  opacity=".7"
                />
              </g>
            ))}
          </g>
          {[
            [123, 79, "#e5b94d"],
            [205, 55, "#bc6755"],
          ].map(([x, y, color], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <ellipse cy="14" rx="13" ry="5" fill="#223e35" opacity=".25" />
              <path
                d="M-5-5q-2 11-8 18 12 7 26 0-8-10-8-18Z"
                fill={color as string}
              />
              <circle cy="-10" r="9" fill={color as string} />
            </g>
          ))}
          <ellipse cx="91" cy="150" rx="15" ry="6" fill="#72966b" />
          <ellipse cx="237" cy="124" rx="17" ry="7" fill="#83a77b" />
        </g>
      )}
      {game === "ledger" && (
        <g>
          {/* 한지 장부: 꿰맨 등, 칸 줄, 채운 점수, 금빛 '장원' 줄과 붉은 낙관 */}
          <g transform="translate(104 92) rotate(-7)">
            <rect x="-74" y="-58" width="152" height="124" rx="4" fill="#2c271d" opacity=".3" />
            <rect x="-78" y="-64" width="152" height="124" rx="4" fill="#efe3c6" />
            <rect x="-78" y="-64" width="16" height="124" rx="3" fill="#8c5b3a" />
            {[-48, -18, 12, 42].map((y) => (
              <path key={y} d={`M-74 ${y}h8`} stroke="#e8cfa2" strokeWidth="2" />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M-56 ${-46 + i * 12}h124`}
                stroke="#c9b48a"
                strokeWidth="1"
              />
            ))}
            <path d="M-20-58v112M14-58v112M44-58v112" stroke="#c9b48a" strokeWidth="1" />
            <rect x="-56" y="2" width="124" height="12" fill="#e5bf68" opacity=".55" />
            {[
              [-12, -42],
              [20, -42],
              [-12, -30],
              [50, -30],
              [-12, -18],
              [20, -6],
              [50, 18],
              [20, 30],
            ].map(([x, y], i) => (
              <path
                key={i}
                d={`M${x} ${y}q3-4 6 0t6 0`}
                stroke="#4a3b2b"
                strokeWidth="1.6"
                fill="none"
                strokeLinecap="round"
              />
            ))}
            <path
              d="M-11 9l4 4 8-9"
              stroke="#9b3a2c"
              strokeWidth="2.2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M-50-56h24M-50-52h16" stroke="#7a6347" strokeWidth="2" strokeLinecap="round" />
            <g transform="translate(52 42) rotate(8)">
              <rect x="-9" y="-9" width="18" height="18" rx="2" fill="#b4432f" />
              <rect x="-6" y="-6" width="12" height="12" fill="none" stroke="#f1d6c4" strokeWidth="1.4" />
              <path d="M-3-3h6M-3 0h6M-3 3h6" stroke="#f1d6c4" strokeWidth="1.2" />
            </g>
          </g>
          {/* 붓 */}
          <g transform="translate(176 44) rotate(28)">
            <rect x="-3" y="-34" width="6" height="56" rx="3" fill="#a47548" />
            <rect x="-3.5" y="18" width="7" height="6" fill="#3d3a33" />
            <path d="M-3.5 24q3.5 16 0 18 3.5-2 7-18Z" fill="#1f1d19" />
          </g>
          {/* 주사위: 아래 셋은 보관(금빛 테), 위 둘은 굴리는 중 */}
          {[
            [212, 142, 0, 6, true],
            [250, 142, 0, 6, true],
            [288, 142, 0, 6, true],
            [228, 80, 18, 6, false],
            [282, 96, -14, 5, false],
          ].map(([x, y, angle, value, kept], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              {kept && (
                <ellipse cy="19" rx="15" ry="4" fill="none" stroke="#f0c56a" strokeWidth="2" opacity=".85" />
              )}
              <g transform={`rotate(${angle})`}>
                <rect x="-15" y="-12" width="32" height="32" rx="6" fill="#243c31" opacity=".3" />
                <rect x="-17" y="-17" width="34" height="34" rx="6" fill="#f2e9d3" />
                <rect x="-15" y="-15" width="30" height="30" rx="5" fill="none" stroke="#d8c7a4" />
                {(value === 5
                  ? [
                      [-8, -8],
                      [8, -8],
                      [0, 0],
                      [-8, 8],
                      [8, 8],
                    ]
                  : [
                      [-8, -8],
                      [8, -8],
                      [-8, 0],
                      [8, 0],
                      [-8, 8],
                      [8, 8],
                    ]
                ).map(([dx, dy], j) => (
                  <circle key={j} cx={dx} cy={dy} r="2.7" fill="#37433a" />
                ))}
              </g>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
