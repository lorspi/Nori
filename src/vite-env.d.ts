/// <reference types="vite/client" />

/** Build-time version string injected by vite.config.ts */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Microsoft Clarity project ID (optional, set in a local .env) */
  readonly VITE_CLARITY_ID?: string;
  /** Hostname where Clarity is allowed to load, e.g. nori.lorspi.com */
  readonly VITE_CLARITY_HOST?: string;
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}
