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

`scripts/parkGeometryPlugin.ts` builds 33 static prop/surface batches in Node using the
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
slow artifact falls back to the original procedural source. The download may
continue for up to 10s to warm the next visit, but late geometry is not installed
after procedural construction has begun. Development
mode also uses the procedural source. Performance marks `park-geometry-ready`
and `park-geometry-fallback` distinguish these paths during measurement;
`park-geometry-deferred` records the startup budget and `park-geometry-cached`
records a late download retained for the next visit.

Pavilion roofs/timber also preserve per-part raycast ranges in the artifact.
Restoration rebuilds the same spatial hierarchy, retaining openings and exact
triangle tests. Identical encoded attribute streams are stored once and decoded
into independent arrays, so later prop transforms cannot affect another batch.

Add only deterministic static builders to the build catalog. Keys must be unique
and include parameters such as LOD. Dynamic/component-owned geometry keeps its
existing lifecycle. Capturing before caller transforms prevents applying those
transforms twice when restoring a cached batch.

Validation covers binary/decoder round trips, cached versus procedural geometry,
environment isolation, production entry/movement/manual, and failed-artifact
entry. Browser comparisons must distinguish local HTTP/WS fixtures from real
development-server measurements; use both scene presentation and first
`WORLD_STATE` when reporting entry readiness.
