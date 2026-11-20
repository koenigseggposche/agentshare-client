import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";

const listeners = new Set<() => void>();
let snapshot = DEFAULT_CLIENT_SETTINGS;

export function getClientSettingsSnapshot(): ClientSettings {
  return snapshot;
}

export function replaceClientSettingsSnapshot(settings: ClientSettings): void {
  snapshot = settings;
  for (const listener of listeners) listener();
}

export function subscribeClientSettingsSnapshot(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetClientSettingsSnapshot(): void {
  listeners.clear();
  snapshot = DEFAULT_CLIENT_SETTINGS;
}
