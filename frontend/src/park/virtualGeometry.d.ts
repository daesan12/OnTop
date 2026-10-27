declare module 'virtual:park-geometry' {
  const url: string | null
  export default url
  export const sceneUrl: string | null
}

declare module 'virtual:park-bindings' {
  const layouts: { development: unknown; production: unknown }
  export default layouts
}
