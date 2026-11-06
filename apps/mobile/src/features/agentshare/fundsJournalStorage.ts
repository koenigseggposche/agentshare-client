import * as FundsJournal from "@agentshare/account-client/FundsJournal";
import { AgentShareAccountError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";

import * as MobileSecureStorage from "../../persistence/mobile-secure-storage";

const key = "agentshare.funds-journal";

const make = Effect.gen(function* () {
  const storage = yield* MobileSecureStorage.MobileSecureStorage;
  const lock = yield* Semaphore.make(1);
  const load = Effect.fn("MobileFundsJournalStorage.load")(() =>
    storage.getItem(key).pipe(
      Effect.mapError(
        (cause) =>
          new AgentShareAccountError({
            operation: "funds-journal",
            category: "unavailable",
            cause,
          }),
      ),
    ),
  );
  const save = Effect.fn("MobileFundsJournalStorage.save")(
    function* (value: string, expected: string | null) {
      if ((yield* load()) !== expected)
        return yield* new AgentShareAccountError({
          operation: "funds-journal",
          category: "unavailable",
        });
      yield* storage.setItem(key, value).pipe(
        Effect.mapError(
          (cause) =>
            new AgentShareAccountError({
              operation: "funds-journal",
              category: "unavailable",
              cause,
            }),
        ),
      );
    },
    (effect) => lock.withPermit(effect),
  );
  return FundsJournal.FundsJournalStorage.of({ load, save });
});

export const layer = Layer.effect(FundsJournal.FundsJournalStorage, make);
