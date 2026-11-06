import * as DeviceCredentials from "@agentshare/account-client/DeviceCredentials";
import * as DeviceLogin from "@agentshare/account-client/DeviceLogin";
import * as FundsClient from "@agentshare/account-client/FundsClient";
import * as FundsJournal from "@agentshare/account-client/FundsJournal";
import * as WalletClient from "@agentshare/account-client/WalletClient";
import { AgentShareAccountError } from "@t3tools/contracts";
import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as MobileSecureStorage from "../../persistence/mobile-secure-storage";
import * as AccountHttp from "./accountHttp";
import * as FundsJournalStorage from "./fundsJournalStorage";

const credentialKey = "agentshare.device-account";
const layerCredentials = Layer.effect(
  DeviceCredentials.DeviceCredentials,
  Effect.gen(function* () {
    const storage = yield* MobileSecureStorage.MobileSecureStorage;
    const failure = (cause: unknown) =>
      new AgentShareAccountError({ operation: "credentials", category: "unavailable", cause });
    return DeviceCredentials.DeviceCredentials.of({
      load: () => storage.getItem(credentialKey).pipe(Effect.mapError(failure)),
      save: (value) => storage.setItem(credentialKey, value).pipe(Effect.mapError(failure)),
      clear: () => storage.removeItem(credentialKey).pipe(Effect.mapError(failure)),
    });
  }),
);

const layerConfig = Layer.succeed(DeviceCredentials.DeviceLoginConfig, {
  consoleUrl:
    process.env.EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL?.trim() ||
    "https://agentshare.taofanke.fun/console",
  deviceName: Device.modelName || "AgentShare mobile",
  verifier: Effect.fn("AgentShareMobile.verifier")(() =>
    Effect.tryPromise({
      try: () => Crypto.getRandomBytesAsync(32),
      catch: (cause) =>
        new AgentShareAccountError({ operation: "login", category: "unavailable", cause }),
    }).pipe(
      Effect.map((bytes) =>
        Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      ),
    ),
  ),
});

const layerLogin = DeviceLogin.layer.pipe(
  Layer.provide(layerCredentials),
  Layer.provide(layerConfig),
);

export const layer = FundsClient.layer.pipe(
  Layer.provideMerge(
    WalletClient.layer.pipe(
      Layer.provide(DeviceLogin.layerAccountConnection),
      Layer.provideMerge(layerLogin),
      Layer.provide(AccountHttp.layer),
    ),
  ),
  Layer.provideMerge(FundsJournal.layer.pipe(Layer.provide(FundsJournalStorage.layer))),
);
