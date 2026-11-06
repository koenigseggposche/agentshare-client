import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { vi } from "vite-plus/test";

import * as HostProcess from "@t3tools/shared/HostProcess";

const { safeStorage } = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: () => {
      throw new Error("Synchronous keychain access blocks the desktop");
    },
    encryptString: () => {
      throw new Error("Synchronous keychain access blocks the desktop");
    },
    decryptString: () => {
      throw new Error("Synchronous keychain access blocks the desktop");
    },
    isAsyncEncryptionAvailable: vi.fn(async () => true),
    encryptStringAsync: vi.fn(async (value: string) => Buffer.from(value)),
    decryptStringAsync: vi.fn(async (_value: Buffer) => ({
      result: "restored credential",
      shouldReEncrypt: false,
    })),
  },
}));

vi.mock("electron", () => ({ safeStorage }));

import * as ElectronSafeStorage from "./ElectronSafeStorage.ts";

describe("ElectronSafeStorage", () => {
  it.effect("keeps other desktop work running while the keychain waits", () =>
    Effect.gen(function* () {
      const storage = yield* ElectronSafeStorage.make;
      const started = Promise.withResolvers<void>();
      const pending = Promise.withResolvers<{ result: string; shouldReEncrypt: boolean }>();
      safeStorage.decryptStringAsync.mockImplementationOnce(() => {
        started.resolve();
        return pending.promise;
      });
      const result = yield* storage.decryptString(new Uint8Array([1, 2, 3])).pipe(Effect.forkChild);
      yield* Effect.promise(() => started.promise);
      let progress = 0;
      yield* Effect.sync(() => {
        progress += 1;
      });
      assert.equal(progress, 1);
      pending.resolve({ result: "restored credential", shouldReEncrypt: false });
      assert.equal(yield* Fiber.join(result), "restored credential");
      assert.isTrue(yield* storage.isEncryptionAvailable);
      assert.deepEqual(
        yield* storage.encryptString("new credential"),
        Buffer.from("new credential"),
      );
    }).pipe(Effect.provideService(HostProcess.Platform, "darwin")),
  );

  it.effect("returns a typed failure when protected decryption is refused", () =>
    Effect.gen(function* () {
      const storage = yield* ElectronSafeStorage.make;
      safeStorage.decryptStringAsync.mockRejectedValueOnce(new Error("keychain unavailable"));
      const error = yield* storage.decryptString(new Uint8Array([1])).pipe(Effect.flip);
      assert.instanceOf(error, ElectronSafeStorage.ElectronSafeStorageDecryptError);
    }).pipe(Effect.provideService(HostProcess.Platform, "darwin")),
  );
});
