/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  readonly VITE_SARVAM_ORG_ID?: string
  readonly VITE_SARVAM_WORKSPACE_ID?: string
  readonly VITE_SARVAM_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
