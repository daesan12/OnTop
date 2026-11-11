import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Markdown } from "./Markdown";
import { filterGuides, filterManuals, gameManuals, groupManuals, parkGuides } from "./catalog";
import { GameArt } from "./GameArt";
import { useManual } from "./manualState";
import { replayWelcomeTour, tourBlockReason } from "../welcomeTour/state";
import {
  isManualGameId,
  type GuideId,
  type ManualCategory,
  type ManualPage,
  type ManualSection,
} from "./types";

// Read top to bottom by a first-time visitor: the park first, then walking around, then playing together.
const navigation: { group: string; items: { id: ManualPage; icon: string; title: string }[] }[] = [
  { group: "처음이라면", items: [
    { id: "intro", icon: "✿", title: "온탑 소개" },
    { id: "welcome", icon: "✦", title: "첫 걸음" },
  ] },
  { group: "공원 생활", items: [
    { id: "controls", icon: "⌘", title: "산책과 조작" },
    { id: "places", icon: "⌖", title: "공원 둘러보기" },
    { id: "social", icon: "☺", title: "함께 어울리기" },
    { id: "coins", icon: "◉", title: "엽전과 꾸미기" },
  ] },
  { group: "함께 놀기", items: [
    { id: "catalog", icon: "▤", title: "게임 찾아보기" },
    { id: "join", icon: "♧", title: "테이블 참여" },
    { id: "watch", icon: "◎", title: "관전과 응원" },
  ] },
  { group: "도움말", items: [
    { id: "account", icon: "⚙", title: "내 계정·설정" },
    { id: "faq", icon: "?", title: "자주 묻는 질문" },
  ] },
];

/** 첫 걸음 페이지에서 설명서를 닫고 체험 투어를 처음부터 다시 시작한다(카메라 비행 없음). */
function TourReplayCard() {
  const reason = tourBlockReason();
  return (
    <button className="manual-first-card" disabled={!!reason} onClick={() => replayWelcomeTour()}>
      <span className="manual-first-icon" aria-hidden="true">✦</span>
      <span>
        <b>공원 투어 다시 보기</b>
        <small>{reason || "설명서를 닫고 걸으면서 다섯 가지를 직접 해 봐요."}</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

function Section({
  section,
  index,
}: {
  section: ManualSection;
  index: number;
}) {
  return (
    <section
      className="manual-section"
      aria-labelledby={`manual-${section.id}`}
    >
      <h4 id={`manual-${section.id}`} tabIndex={-1}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        {section.title}
      </h4>
      {section.figure && (
        <figure className="manual-figure">
          {section.figure.render()}
          <figcaption>{section.figure.caption}</figcaption>
        </figure>
      )}
      {section.markdown && (
        <div className="manual-markdown">
          <Markdown text={section.markdown} />
        </div>
      )}
      {section.paragraphs?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {section.steps && (
        <ol className="manual-steps">
          {section.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      {section.table && (
        <div className="manual-table-wrap">
          <table>
            <caption className="manual-sr-only">{section.title}</caption>
            <thead>
              <tr>
                {section.table.headers.map((header) => (
                  <th key={header} scope="col">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {section.table.rows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={i}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {section.example && (
        <aside className="manual-example">
          <b>함께 보는 예시</b>
          <h5>{section.example.title}</h5>
          <p>{section.example.text}</p>
        </aside>
      )}
      {section.tip && (
        <p className="manual-tip">
          <b>기억해 주세요</b>
          {section.tip}
        </p>
      )}
    </section>
  );
}

export default function ManualContents() {
  const page = useManual((s) => s.page);
  const [displayPage, setDisplayPage] = useState(page);
  const pageLeaving = displayPage !== page;
  useEffect(() => {
    if (!pageLeaving) return;
    const timer = window.setTimeout(
      () => setDisplayPage(page),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 80,
    );
    return () => window.clearTimeout(timer);
  }, [page, pageLeaving]);
  const [category, setCategory] = useState<"all" | ManualCategory>("all");
  const [query, setQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const firstPage = useRef(page);
  const game = isManualGameId(displayPage)
    ? gameManuals.find((item) => item.id === displayPage)
    : undefined;
  const guide =
    displayPage !== "catalog" && !isManualGameId(displayPage)
      ? parkGuides[displayPage as GuideId]
      : undefined;
  const sections = game?.sections ?? guide?.sections;
  const results = filterManuals(category, query);
  const guideResults = filterGuides(query);
  // Guide pages read like chapters: each one points on to the next in the contents.
  const pageOrder = navigation.flatMap(({ items }) => items);
  const nextPage = guide
    ? pageOrder[pageOrder.findIndex((item) => item.id === displayPage) + 1]
    : undefined;
  const detailedSections = (
    <>
      <nav className="manual-chapters" aria-label="설명 목차">
        {sections?.map((section, index) => (
          <button key={section.id} onClick={() => jump(section.id)}>
            {index + 1}. {section.title}
          </button>
        ))}
      </nav>
      {sections?.map((section, index) => (
        <Section key={section.id} section={section} index={index} />
      ))}
    </>
  );
  function go(next: ManualPage) {
    useManual.setState({ page: next });
  }
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    if (firstPage.current !== displayPage)
      title.current?.focus({ preventScroll: true });
    firstPage.current = displayPage;
  }, [displayPage, category, query]);
  function jump(id: string) {
    const heading = scroller.current?.querySelector<HTMLElement>(
      `#manual-${id}`,
    );
    const container = scroller.current;
    if (container && heading)
      container.scrollTo({
        top:
          container.scrollTop +
          heading.getBoundingClientRect().top -
          container.getBoundingClientRect().top -
          15,
      });
    heading?.focus({ preventScroll: true });
  }
  return (
    <div className="manual-body">
      <nav className="manual-nav" aria-label="설명서 안내">
        <div className="manual-nav-links">
          {navigation.map(({ group, items }) => (
            <div key={group} className="manual-nav-group" role="group" aria-label={group}>
              <small aria-hidden="true">{group}</small>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  aria-current={
                    page === item.id || (item.id === "catalog" && !!game)
                      ? "page"
                      : undefined
                  }
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.title}
                  <i aria-hidden="true">›</i>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="manual-nav-note">
          <svg viewBox="0 0 180 90" aria-hidden="true">
            <path
              d="M20 68h140M38 64V37h104v27M27 37q48-10 63-30 15 20 63 30ZM55 37v27m35-27v27m35-27v27M30 74h120M24 80h132"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              d="M3 69q-3-28 12-45m146 46q20-29 7-49"
              stroke="currentColor"
              fill="none"
              strokeWidth="4"
            />
            <circle cx="12" cy="25" r="14" fill="currentColor" opacity=".3" />
            <circle cx="169" cy="23" r="17" fill="currentColor" opacity=".3" />
          </svg>
          <p>
            같이 놀면
            <br />
            좋은 날이 된다.
          </p>
          <small>온탑 · 탑골공원에서</small>
        </div>
      </nav>
      <div className="manual-main">
        <div className="manual-search-row">
          <span>
            {game
              ? "게임 / " + game.title
              : guide
                ? "공원 안내"
                : "궁금한 한 판을 찾아보세요"}
          </span>
          <label className="manual-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="게임 설명 검색"
              placeholder="게임 이름, 규칙, 궁금한 말 검색"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                go("catalog");
              }}
            />
          </label>
        </div>
        <div
          className="manual-scroll"
          ref={scroller}
          tabIndex={0}
          aria-label="설명서 본문"
        >
          <div
            key={displayPage}
            className={`manual-page${pageLeaving ? " manual-page-leaving" : ""}`}
          >
            {displayPage === "catalog" ? (
              <>
                <div
                  className="manual-categories"
                  role="group"
                  aria-label="게임 분류"
                >
                  {(
                    [
                      { id: "all", label: "전체" },
                      { id: "game", label: "보드게임" },
                      { id: "minigame", label: "미니게임" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      aria-label={tab.label}
                      aria-pressed={category === tab.id}
                      onClick={() => setCategory(tab.id)}
                    >
                      {tab.label}
                      <small>
                        {tab.id === "all"
                          ? gameManuals.length
                          : gameManuals.filter((g) => g.category === tab.id)
                              .length}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="manual-catalog-title">
                  <div>
                    <span className="manual-eyebrow">PLAY TOGETHER</span>
                    <h3 ref={title} tabIndex={-1}>
                      {query
                        ? "검색 결과"
                        : category === "minigame"
                          ? "미니게임"
                          : "오늘은 어떤 한 판?"}
                    </h3>
                  </div>
                  <span role="status">
                    {query
                      ? `‘${query}’ · 게임 ${results.length}개 · 공원 안내 ${guideResults.length}개`
                      : "이용 가능한 게임과 개발중인 콘텐츠"}
                  </span>
                </div>
                {results.length > 0 ? (
                  groupManuals(results).map((group, groupIndex, groups) => (
                  <section key={group.category} className="manual-group" aria-labelledby={`manual-group-${group.category}`}>
                  <h4 id={`manual-group-${group.category}`} className="manual-group-title">
                    {group.label}
                    <small>{group.games.length}</small>
                  </h4>
                  <div className="manual-grid">
                    {group.games.map((item, index) => (
                      <button
                        key={item.id}
                        className="manual-card"
                        data-status={item.status}
                        style={{ "--card-order": groups.slice(0, groupIndex).reduce((sum, g) => sum + g.games.length, index) } as CSSProperties}
                        onClick={() => go(item.id)}
                        aria-label={`${item.title} 설명 읽기`}
                      >
                        <GameArt game={item.id} />
                        {item.status === "development" && (
                          <span className="manual-status-badge">개발중</span>
                        )}
                        <div className="manual-card-copy">
                          <span>
                            {item.players} ·{" "}
                            {item.category === "game"
                              ? "보드게임"
                              : item.category === "vr"
                                ? "VR"
                                : "미니게임"}
                          </span>
                          <h4>{item.title}</h4>
                          <p>{item.subtitle}</p>
                          <b>
                            {item.status === "development"
                              ? "개발 현황 보기"
                              : "설명 읽기"}{" "}
                            <span aria-hidden="true">↗</span>
                          </b>
                        </div>
                      </button>
                    ))}
                  </div>
                  </section>
                  ))
                ) : guideResults.length === 0 && (
                  <div className="manual-empty">
                    <span aria-hidden="true">⌕</span>
                    <h4>찾으시는 설명이 없어요</h4>
                    <p>
                      게임 이름이나 ‘공격’, ‘골인’, ‘점수’ 같은 말로 다시
                      찾아보세요.
                    </p>
                    <button
                      onClick={() => {
                        setQuery("");
                        setCategory("all");
                      }}
                    >
                      전체 게임 보기
                    </button>
                  </div>
                )}
                {guideResults.length > 0 && (
                  <section className="manual-guide-results" aria-label="공원 안내 검색 결과">
                    <h4>공원 안내에서 찾았어요</h4>
                    {guideResults.map((id) => (
                      <button key={id} onClick={() => go(id)}>
                        <b>{parkGuides[id].title}</b>
                        <small>{parkGuides[id].subtitle}</small>
                        <span aria-hidden="true">→</span>
                      </button>
                    ))}
                  </section>
                )}
                <button
                  className="manual-first-card"
                  onClick={() => go("intro")}
                >
                  <span className="manual-first-icon" aria-hidden="true">
                    ✦
                  </span>
                  <span>
                    <b>처음 오셨다면, 여기부터</b>
                    <small>온탑 소개부터 테이블에 앉아 첫 게임을 시작하기까지</small>
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
                <p className="manual-edition">
                  현재 온탑에 적용된 규칙을 기준으로 설명해요. 게임마다 익숙한
                  집 규칙과 다를 수 있어요.
                </p>
              </>
            ) : (
              <article className={`manual-article${game ? " game-guide" : ""}`}>
                {game && (
                  <button className="manual-back" onClick={() => go("catalog")}>
                    ← 게임 목록
                  </button>
                )}
                <div className="manual-detail-heading">
                  <div>
                    <span className="manual-eyebrow">
                      {game
                        ? `${game.category === "game" ? "보드게임" : "미니게임"} · ${game.players}`
                        : "공원 이용 안내"}
                    </span>
                    <h3 ref={title} tabIndex={-1}>
                      {game?.title ?? guide?.title}
                    </h3>
                    <p>{game?.subtitle ?? guide?.subtitle}</p>
                  </div>
                  {game && <GameArt game={game.id} />}
                </div>
                {displayPage === "welcome" && <TourReplayCard />}
                {game ? (
                  <>
                    {/* One designed page per game: facts, the flow of a round, keys and must-know rules, then the full rules. */}
                    <dl className="game-guide-facts">
                      <div><dt>함께하는 인원</dt><dd>{game.players}</dd></div>
                      <div><dt>이기는 방법</dt><dd>{game.goal}</dd></div>
                      <div><dt>제한시간</dt><dd>{game.timing}</dd></div>
                    </dl>
                    <p className="game-guide-summary"><b>한눈에 보기</b>{game.summary}</p>
                    <section className="game-guide-block" aria-labelledby="game-guide-flow">
                      <h4 id="game-guide-flow">한 판의 흐름</h4>
                      <ol className="game-guide-flow">
                        {game.flow.map((step, index) => (
                          <li key={step.title}>
                            <span aria-hidden="true">{index + 1}</span>
                            <b>{step.title}</b>
                            <p>{step.body}</p>
                          </li>
                        ))}
                      </ol>
                    </section>
                    {game.keys && (
                      <section className="game-guide-block" aria-labelledby="game-guide-keys">
                        <h4 id="game-guide-keys">조작</h4>
                        <ul className="game-guide-keys">
                          {game.keys.map(([key, action]) => (
                            <li key={key}><kbd>{key}</kbd>{action}</li>
                          ))}
                        </ul>
                      </section>
                    )}
                    <section className="game-guide-block" aria-labelledby="game-guide-points">
                      <h4 id="game-guide-points">꼭 기억해요</h4>
                      <ul className="game-guide-points">
                        {game.points.map((point) => <li key={point}>{point}</li>)}
                      </ul>
                    </section>
                    <section className="game-guide-block game-guide-rules" aria-labelledby="game-guide-rules">
                      <div className="game-guide-rules-head">
                        <h4 id="game-guide-rules">자세한 규칙</h4>
                        {game.rulebook && (
                          <a href={game.rulebook.rulebookUrl} download={`${game.title}-상세규칙.md`}>
                            규칙 파일 내려받기
                          </a>
                        )}
                      </div>
                      {detailedSections}
                    </section>
                  </>
                ) : (
                  detailedSections
                )}
                <div className="manual-end">
                  <span>
                    {game?.status === "development"
                      ? "이용 가능한 게임은 목록에서 확인해 주세요."
                      : "이제 함께 한 판 해 볼까요?"}
                  </span>
                  {nextPage && (
                    <button onClick={() => go(nextPage.id)}>
                      다음 장 · {nextPage.title} →
                    </button>
                  )}
                  <button
                    onClick={() => {
                      scroller.current?.scrollTo({ top: 0 });
                      title.current?.focus({ preventScroll: true });
                    }}
                  >
                    맨 위로 ↑
                  </button>
                </div>
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
