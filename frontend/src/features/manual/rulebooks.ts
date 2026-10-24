import gomoku from "./rulebooks/gomoku.md?raw";
import farkle from "./rulebooks/farkle.md?raw";
import onecard from "./rulebooks/onecard.md?raw";
import bridge from "./rulebooks/bridge.md?raw";
import type { Rulebook, RulebookPage } from "./types";

// Chapters share the same trusted Markdown source as the downloadable rulebook.
function book(id: string, markdown: string, pages: RulebookPage[]): Rulebook {
  return {
    markdown,
    rulebookUrl: `${import.meta.env.BASE_URL}rulebooks/${id}/v1.md`,
    sections: markdown
      .replace(/\r\n/g, "\n")
      .split(/^## /m)
      .slice(1)
      .map((chapter, index) => {
        const end = chapter.indexOf("\n");
        return {
          id: `rule-${index + 1}`,
          title: chapter.slice(0, end).trim(),
          markdown: chapter.slice(end + 1).trim(),
        };
      }),
    pages,
  };
}

function page(
  file: string,
  title: string,
  alt: string,
  note?: string,
): RulebookPage {
  return {
    src: `${import.meta.env.BASE_URL}art/rulebooks/${file}.webp`,
    title,
    alt,
    note,
  };
}

export const rulebooks = {
  gomoku: book("gomoku", gomoku, [
    { src:"guide:renju", title:"돌 놓기와 렌주 규칙", alt:"흑은 정확히 5목, 백은 5목 이상. 흑 삼삼·사사·장목 금수, 정확한 5목 승리 우선. 한 차례 30초." },
  ]),
  farkle: book("farkle", farkle, [
    { src:"guide:farkle", title:"굴리고, 고르고, 멈추기", alt:"6개 주사위로 득점 조합을 선택하고 Q로 확정하거나 R로 다시 굴립니다. 한 차례 전체 30초입니다." },
    page(
      "farkle-scores",
      "점수표와 450점 선택 예시",
      "1은 100점, 5는 50점. 3·3·3·1·5·2에서 3 세 개와 1, 5를 고르면 450점이고 2는 선택하지 않습니다. 같은 눈과 연속 눈의 점수표입니다.",
    ),
  ]),
  onecard: book("onecard", onecard, [
    page(
      "onecard-play",
      "같은 카드 찾기와 원카드 선언",
      "2~4명이 7장으로 시작합니다. 바닥과 숫자 또는 유효 무늬가 같은 카드를 냅니다. 한 장이 남으면 3초 안에 원카드를 선언하고 마지막 카드를 내면 승리합니다.",
    ),
    page(
      "onecard-actions",
      "특수 카드와 공격 막기",
      "특수 카드 효과와 마지막 공격 카드별 대응표. 하트 2 다음 스페이드 2를 내면 누적 4장 공격, 스페이드 3으로 전부 방어할 수 있습니다.",
      "7이나 조커를 내면 다음 유효 무늬도 선택해요. 공격 중에는 그림의 대응표가 우선이며, 마지막 카드라면 추가 효과 없이 바로 승리해요.",
    ),
  ]),
  bridge: book("bridge", bridge, [
    page(
      "bridge-play",
      "비밀 주사위와 믿기",
      "말 7개 중 하나가 출발합니다. 주사위 1·2·3·4·X·X를 혼자 보고 1~4를 선언합니다. 모두 믿으면 실제 눈을 공개하지 않고 선언만큼 이동합니다.",
    ),
    page(
      "bridge-result-dice-v2",
      "의심의 결과와 승리",
      "선언이 진실이면 의심한 사람의 말이, 거짓이면 선언자의 말이 떨어집니다. 맞힌 쪽은 선언 값만큼 이동합니다. 유효한 골인 말 3개면 즉시 승리합니다.",
      "골인 번호는 1~8번까지 한 번씩만 사용해요. 이동할 말 없이 의심에 실패하면 가장 낮은 점수의 골인 말을 잃어요. 없어진 번호는 다시 채우지 않으며, 8번까지 발급되면 정산해요. 자세한 예외는 상세 규칙에서 확인하세요.",
    ),
  ]),
} satisfies Record<string, Rulebook>;
