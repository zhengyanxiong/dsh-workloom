/**
 * Workloom's own version, stamped into the Client bundle at build time.
 *
 * The Settings page shows it and compares it with the npm registry; source-mode
 * tests run without the build define and fall back to a development marker.
 */
declare const __LOOM_VERSION__: string | undefined

/** Version this Client bundle was built from. */
export const LOOM_VERSION: string = typeof __LOOM_VERSION__ === 'undefined' ? '0.0.0-dev' : __LOOM_VERSION__
