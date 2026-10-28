# Park entry startup

Production entry packages the canonical `public/park-bindings.dev.json` and
`public/park-bindings.json` into the frontend build. Only the exact development
hostname selects the development layout. Local Vite development, including
`frontend-test` mode, continues to fetch its selected public layout. The runtime
still validates the layout and only binds table IDs actually returned by the
server; map verification and authentication are unchanged.

Deploy layout/emote edits with a new frontend build. Replacing a public JSON
after a build does not replace the packaged configuration. The public files stay
available for integration checks and are the single source for both copies.

`scripts/parkGeometryPlugin.ts` builds 34 static prop/surface batches in Node using the
existing procedural sources. Named `PropBuilder` instances capture their result
before callers apply later transforms. The artifact preserves original Float32
bits, attribute seams, triangle/index order and bounds. Meshopt index sequence
encoding preserves order; no geometry quantization or simplification is used.
The compressed artifact is generated on each production build and is not checked
into Git. Browser decoding uses the existing shipped Meshopt decoder.

During authentication, the browser loads that content-hashed artifact at low
network priority and module-preloads the scene in parallel. A cached artifact
gets a 150ms head start; entry never waits longer for this optional cache.
When geometry is ready, named builders skip primitive creation and vertex welding. Source
loops still run, preserving their non-geometry side effects. A failed, corrupt or
slow artifact falls back to the original procedural source. A slow download is
aborted at the budget to avoid competing with critical code/maps. Once the scene
starts preparing its renderer, a separate low-priority request (up to 10s) warms
the next visit. Late geometry is not installed after procedural construction has begun. Development
mode also uses the procedural source. Performance marks `park-geometry-ready`
and `park-geometry-fallback` distinguish these paths during measurement;
`park-geometry-deferred` records the startup budget and `park-geometry-cached`
records a late download retained for the next visit. `park-geometry-warmed`
records completion of the deferred download.

Pavilion roofs/timber and pagoda stone also preserve per-part raycast ranges in the artifact.
Restoration rebuilds the same spatial hierarchy, retaining openings and exact
triangle tests. Identical encoded attribute streams are stored once and decoded
into independent arrays, so later prop transforms cannot affect another batch.

Add only deterministic static builders to the build catalog. Keys must be unique
and include parameters such as LOD. Dynamic/component-owned geometry keeps its
existing lifecycle. Capturing before caller transforms prevents applying those
transforms twice when restoring a cached batch.

Cold procedural construction keeps source indices through transforms and merging.
Only each unique source vertex needs its coordinate/normal/color work; welding
memoizes repeated source indices while preserving first occurrence and triangle
order. Mixed non-indexed sources receive an identity index. Box/sphere templates
are reused within each prop builder and disposed after finishing. Structure copies
use `BufferGeometry.copy`, avoiding a subclass's redundant default constructor.
All 34 baked batches, including raycast ranges, remain byte-identical after decode.

`prepareScene` starts asynchronous shader compilation, uploads unique visible
material maps in yielding batches, then waits for all prepared program variants
before the first presented draw. Shader diagnostics remain enabled. Video
textures retain their normal playback lifecycle. Performance marks distinguish
preparation start, texture readiness, program readiness and first presentation.

`node scripts/prepare-entry-images.mjs` regenerates checked-in entry WebP
derivatives. Source art stays untouched. HUD pixels match their display budget;
advertisement derivatives retain aspect ratio and the existing 1920px runtime
poster limit, eliminating runtime resizing of oversized sources. Vite fingerprints
their URLs. Vercel caches only the hashed `/assets/` directory as immutable;
HTML, authentication, public mutable files and APIs retain their existing policy.

Validation covers binary/decoder round trips, cached versus procedural geometry,
environment isolation, production entry/movement/manual, and failed-artifact
entry. Browser comparisons must distinguish local HTTP/WS fixtures from real
development-server measurements; use both scene presentation and first
`WORLD_STATE` when reporting entry readiness.
