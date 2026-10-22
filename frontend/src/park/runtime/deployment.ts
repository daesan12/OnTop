/** The team's local test IDs must never become the default/production deployment mapping. */
export function parkBindingsUrl(
  mode = import.meta.env.MODE,
  development = import.meta.env.DEV,
) {
  return development && mode === 'frontend-test'
    ? '/park-bindings.frontend-test.json'
    : '/park-bindings.json'
}
