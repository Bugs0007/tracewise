/// <reference types="vite/client" />

declare module '*.py?raw' {
  const src: string;
  export default src;
}
declare module '*/react.production.min.js?raw' {
  const src: string;
  export default src;
}
declare module '*/react-dom.production.min.js?raw' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
