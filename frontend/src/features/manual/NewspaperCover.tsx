import coverPhoto from "./art/newspaper-cover-photo.webp";

const todayGames: { title: string; color: string }[][] = [
  [
    { title: "오목", color: "#2f655c" },
    { title: "원카드", color: "#be4834" },
  ],
  [
    { title: "주사위 한 판", color: "#be8c2c" },
    { title: "거짓말 다리 건너기", color: "#426c94" },
  ],
];

/** Front page seen only while the sheet is folded; decorative, so it stays out of the accessibility tree. */
export function NewspaperCover() {
  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  return (
    <div className="newspaper-cover">
      <div className="cover-top-line">
        <span>제 1호 · {today} · 값 0냥</span>
        <span>오늘의 날씨 · 맑음, 놀기 좋은 날</span>
      </div>
      <div className="cover-masthead">
        <span className="manual-seal">탑</span>
        <b>OnTop</b>
        <i className="cover-stamp">창간호</i>
      </div>
      <p className="cover-motto">좋은 사람과 좋은 시간, 탑골에서</p>
      <p className="cover-headline">탑골 정자에 놀이판이 열렸다</p>
      <p className="cover-deck">
        오목 · 원카드 · 주사위 · 거짓말 다리, 오늘은 누구와 한 판?
      </p>
      <figure className="cover-photo">
        <div>
          <img src={coverPhoto} alt="" decoding="async" />
        </div>
        <figcaption>
          ▲ 탑골 정자에서 열린 오목 한 판. 구경꾼들이 숨을 죽이고 지켜봤다.
        </figcaption>
      </figure>
      <div className="cover-bottom">
        <div className="cover-games">
          <b>오늘의 놀이판</b>
          {todayGames.map((row) => (
            <div key={row[0].title}>
              {row.map((game) => (
                <span key={game.title}>
                  <i style={{ background: game.color }} />
                  {game.title}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="cover-open-note">
          <b>신문을 펼쳐 게임을 골라요 ▶</b>
          <span>다음 호 예고 · 장기 (준비 중)</span>
        </div>
      </div>
    </div>
  );
}
