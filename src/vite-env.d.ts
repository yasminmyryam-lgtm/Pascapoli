/// <reference types="vite/client" />

declare module '*?inline' {
  const src: string
  export default src
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_PUBLIC_BASE_URL?: string
  readonly VITE_GAME_SERVER_URL?: string
  readonly VITE_ECONOMY_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
