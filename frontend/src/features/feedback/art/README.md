# Traditional OnTop feedback art

Generated with the built-in `image_gen` tool using the user's two supplied images as style/material references. Original attachment names: `전통 정원 속 온탑 소리함 UI.png` and `전통 기와 탑 문양 소리함 콘셉트 시트.png`.

Production prompt set:

- `feedback-roof.webp`: isolated, front-on charcoal curved Korean giwa roof with an oxblood wooden beam and restrained aged brass; transparent outside, no text, panel, controls, mailbox or environment. Complete upturned endcaps. The roof remains fixed while a separate paper UI unfurls beneath it.
- `feedback-paper.webp`: front-on blank warm ivory hanji panel with fine paper fibers, thin red wooden rim, sparse watercolor plum blossoms at the margins, a small bird and faint sepia pagoda/pavilion silhouettes at the bottom right. Central area blank for real HTML controls; no rendered text or form elements.
- `feedback-mailbox.webp`: one full front view of the reference's red wooden feedback box, charcoal giwa roof, ivory `온탑 소리함` plaque, unobstructed black brass-framed slot, envelope and gold pagoda emblems, stone pedestal with pagoda and flower panels. Transparent outside, no scene, labels or extra views.

The generated PNGs were encoded as WebP for the app, preserving alpha. All actual form text, the 600-character input, topic controls, and envelope animation are code-native. The in-world 3D model is authored in `world/art/mailboxGeometry.ts`, keeps the existing collision envelope and includes a cheaper distant LOD.

Local review: run `pnpm dev:feedback` from `frontend`, then open `/feedback-preview.html`. This explicit development entry uses an in-memory mock and starts no authenticated HTTP or WebSocket transport. The normal application retains the existing private server feedback contract.
