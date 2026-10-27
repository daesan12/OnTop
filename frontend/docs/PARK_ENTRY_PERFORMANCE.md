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

`scripts/parkGeometryPlugin.ts` builds 27 static prop batches in Node using the
existing procedural sources. Named `PropBuilder` instances capture their result
before callers apply later transforms. The artifact preserves original Float32
bits, attribute seams, triangle/index order and bounds. Meshopt index sequence
encoding preserves order; no geometry quantization or simplification is used.
The compressed artifact is generated on each production build and is not checked
into Git. Browser decoding uses the existing shipped Meshopt decoder.

During authentication, the browser loads that content-hashed artifact and
module-preloads the scene in parallel. The scene evaluates after the geometry is
installed, so named builders skip primitive creation and vertex welding. Source
loops still run, preserving their non-geometry side effects. A failed, corrupt or
timed-out (2s) artifact falls back to the original procedural source. Development
mode also uses the procedural source. Performance marks `park-geometry-ready`
and `park-geometry-fallback` distinguish these paths during measurement.

Add only deterministic static builders to the build catalog. Keys must be unique
and include parameters such as LOD. Dynamic/component-owned geometry keeps its
existing lifecycle. Capturing before caller transforms prevents applying those
transforms twice when restoring a cached batch.

Validation covers binary/decoder round trips, cached versus procedural geometry,
environment isolation, production entry/movement/manual, and failed-artifact
entry. Browser comparisons must distinguish local HTTP/WS fixtures from real
development-server measurements; use both scene presentation and first
`WORLD_STATE` when reporting entry readiness.
