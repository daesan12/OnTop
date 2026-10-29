import gomoku from "./rulebooks/gomoku.md?raw";
import farkle from "./rulebooks/farkle.md?raw";
import onecard from "./rulebooks/onecard.md?raw";
import bridge from "./rulebooks/bridge.md?raw";
import type { Rulebook } from "./types";

// Chapters share the same trusted Markdown source as the downloadable rulebook.
function book(id: string, markdown: string): Rulebook {
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
  };
}

export const rulebooks = {
  gomoku: book("gomoku", gomoku),
  farkle: book("farkle", farkle),
  onecard: book("onecard", onecard),
  bridge: book("bridge", bridge),
} satisfies Record<string, Rulebook>;
