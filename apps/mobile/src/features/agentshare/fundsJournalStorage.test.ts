import * as FundsJournal from "@agentshare/account-client/FundsJournal";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { vi } from "vite-plus/test";

vi.mock("expo-secure-store", () => ({}));

import * as MobileSecureStorage from "../../persistence/mobile-secure-storage";
import * as FundsJournalStorage from "./fundsJournalStorage";

it.effect("preserves secure payment recovery across restarts and refuses a stale writer", () =>
  Effect.gen(function* () {
    const values = new Map<string, string>([["agentshare.device-account", "generated-credential"]]);
    let failWrites = false;
    const storage = Layer.succeed(MobileSecureStorage.MobileSecureStorage, {
      getItem: (key) => Effect.sync(() => values.get(key) ?? null),
      setItem: (key, value) =>
        Effect.suspend(() =>
          failWrites
            ? Effect.fail(
                new MobileSecureStorage.MobileSecureStorageError({
                  operation: "write",
                  key,
                  cause: new Error("generated storage failure"),
                }),
              )
            : Effect.sync(() => {
                values.set(key, value);
              }),
        ),
      removeItem: (key) => Effect.sync(() => void values.delete(key)),
    });
    const restart = () =>
      FundsJournal.FundsJournalStorage.pipe(
        Effect.provide(FundsJournalStorage.layer.pipe(Layer.provide(storage))),
      );
    const first = yield* restart();
    yield* first.save("generated pending payment", null);
    const restarted = yield* restart();
    assert.equal(yield* restarted.load(), "generated pending payment");
    assert.equal(
      (yield* restarted.save("stale replacement", null).pipe(Effect.flip)).category,
      "unavailable",
    );
    failWrites = true;
    assert.equal(
      (yield* restarted.save("replacement", "generated pending payment").pipe(Effect.flip))
        .category,
      "unavailable",
    );
    assert.equal(yield* restarted.load(), "generated pending payment");
    assert.equal(values.get("agentshare.device-account"), "generated-credential");
    assert.equal(values.size, 2);
  }),
);
