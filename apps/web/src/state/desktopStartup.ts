import type { DesktopStartupState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";

class DesktopStartupReadError extends Schema.TaggedError<DesktopStartupReadError>()(
  "DesktopStartupReadError",
  { cause: Schema.optionalKey(Schema.Defect()) },
) {}

const loadDesktopStartupState = Effect.fn("desktop.startup.load")(function* () {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  if (!bridge) return yield* new DesktopStartupReadError({});
  return yield* Effect.tryPromise({
    try: (): Promise<DesktopStartupState> => bridge.getStartupState(),
    catch: (cause) => new DesktopStartupReadError({ cause }),
  });
});

export const desktopStartupStateAtom = Atom.make(loadDesktopStartupState()).pipe(
  Atom.keepAlive,
  Atom.swr({ staleTime: 30_000, revalidateOnMount: true }),
);

export function refreshDesktopStartup(): void {
  appAtomRegistry.refresh(desktopStartupStateAtom);
}
