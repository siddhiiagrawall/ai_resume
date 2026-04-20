/// <reference types="vite/client" />

/**
 * vite-env.d.ts — Vite Environment Type Declarations
 *
 * This file is REQUIRED in every Vite + TypeScript project.
 * Without it, TypeScript doesn't know that `import.meta.env` exists,
 * causing: "Property 'env' does not exist on type 'ImportMeta'"
 *
 * What `/// <reference types="vite/client" />` does:
 *  - Tells TypeScript to include Vite's built-in type definitions
 *  - These define the ImportMeta interface with the .env property
 *  - Also types import.meta.hot (HMR), import.meta.glob, etc.
 *
 * VITE_* env variable convention:
 *  Vite only exposes env variables prefixed with VITE_ to client code.
 *  This is a security feature — other variables (DB passwords, etc.) stay server-side.
 *  Example: VITE_API_URL=http://localhost:3001/api → import.meta.env.VITE_API_URL
 */

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  // Add more VITE_ env variables here as the project grows
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
