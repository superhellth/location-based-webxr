/**
 * Build-time metadata accessor.
 *
 * The five `__BUILD_*__` / `__*_VERSION__` constants are replaced at build
 * time by Vite's `define` block (see config/vite.config.ts).  This module
 * isolates the global-constant access to a single place so all other code
 * imports `getBuildInfo()` instead of touching the globals directly.
 */

export interface BuildInfo {
  commitHash: string;
  appVersion: string;
  libraryVersion: string;
  frameworkVersion: string;
  buildTime: string;
}

type InjectedBuildKey =
  | '__BUILD_COMMIT__'
  | '__APP_VERSION__'
  | '__LIB_VERSION__'
  | '__FW_VERSION__'
  | '__BUILD_TIME__';

function readInjectedValues(): Record<InjectedBuildKey, unknown> {
  return {
    __BUILD_COMMIT__: globalThis.__BUILD_COMMIT__,
    __APP_VERSION__: globalThis.__APP_VERSION__,
    __LIB_VERSION__: globalThis.__LIB_VERSION__,
    __FW_VERSION__: globalThis.__FW_VERSION__,
    __BUILD_TIME__: globalThis.__BUILD_TIME__,
  };
}

function readInjectedString(name: InjectedBuildKey): string {
  const value = readInjectedValues()[name];

  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid build metadata: ${name}`);
  }

  return value;
}

export function getBuildInfo(): BuildInfo {
  return {
    commitHash: readInjectedString('__BUILD_COMMIT__'),
    appVersion: readInjectedString('__APP_VERSION__'),
    libraryVersion: readInjectedString('__LIB_VERSION__'),
    frameworkVersion: readInjectedString('__FW_VERSION__'),
    buildTime: readInjectedString('__BUILD_TIME__'),
  };
}
