# OnTop observatory memo art

Built-in `image_gen` generation, 2026-10-28. User-provided five-panel Korean memo-box concept was the style reference. Code renders all headings, note contents, inputs, topic controls and buttons; these images are decoration only.

Production prompt set:

- `notes-board.webp`: isolated orthographic front view of the reference's wide wooden memo-board panel; warm cream blank hanji, chunky weathered wood rim, arched central crest, green ivy in upper corners and pigeon at lower right. Cozy painterly 3D illustration. Transparent outside silhouette. No text, pinned notes, buttons, controls, close mark or scene. Central 85% kept clean for live HTML.
- `notes-paper.webp`: isolated vertical 4:5 blank cream hanji composer panel; thin warm wooden edge, tiny ivy at top/bottom left, pink petals at bottom right. Transparent outside, clean low-contrast paper center. No lettering, controls, textarea or pen. Also used for the narrower mobile board to preserve frame proportions.
- `fountain-pen.webp`: isolated vintage walnut fountain pen with brass fittings and visible golden nib, diagonally from lower-left nib to upper-right cap. Transparent background, no ink pot/paper/writing. Painterly game asset.

Generated PNGs were trimmed at transparent borders and WebP-encoded (quality 88, alpha 100; board 1400px, paper 1000px, pen 320px). Runtime assets total about 324 KB. Originals remain under Codex generated_images; project-owned assets live here.

The 3D world prop is code-authored in `world/art/notesBoardGeometry.ts` with material-batched geometry and two LODs. It retains the original summit anchor/collider envelope. UI zoom and paper folds are CSS; the pen follows a native textarea caret measured with a non-interactive mirror. Motion is disabled under prefers-reduced-motion.

Local preview: `pnpm dev:notes`, open `/notes-preview.html`. The explicit local mode uses seeded in-memory notes and starts no auth HTTP/WS transport. Preview tests: `pnpm test:e2e:notes-preview`.
