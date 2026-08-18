export type AppMode = "authoring" | "viewing";

/** Pure. `?tour=` presence decides the mode (contract D13). */
export function resolveAppMode(url: URL): AppMode {
  return url.searchParams.has("tour") ? "viewing" : "authoring";
}
