import { AsyncResult } from "effect/reactivity";
import { appAtomRegistry } from "../state/atom-registry";
import { mobilePreferencesAtom } from "../state/preferences";
import { setUiLanguage } from "./uiText";

export function installLanguageRuntime() {
  return appAtomRegistry.subscribe(
    mobilePreferencesAtom,
    (preferences) => {
      if (AsyncResult.isSuccess(preferences)) setUiLanguage(preferences.value.uiLanguage ?? "zh");
    },
    { immediate: true },
  );
}
