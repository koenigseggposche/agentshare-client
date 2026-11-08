import * as CoreClient from "@agentshare/core-client/CoreClient";
import { AgentShareCoreError } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { compareSemverVersions, parseSemver } from "@t3tools/shared/semver";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

const isCoreError = Schema.is(AgentShareCoreError);
const decodeVersion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
);

const make = Effect.gen(function* () {
  const home = yield* CoreClient.CoreHome;
  const installedCore = yield* CoreClient.CoreClient;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const env = yield* HostProcess.Environment;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const platform = yield* HostProcess.Platform;
  const packagedExecutable = (yield* HostProcess.IsExecutable)
    ? path.join(
        path.dirname(yield* HostProcess.ExecutablePath),
        "agentshare-core",
        platform === "win32" ? "agentshare-core.exe" : "agentshare-core",
      )
    : undefined;
  const executable =
    env.AGENTSHARE_CORE_EXECUTABLE?.trim() ||
    (packagedExecutable &&
    (yield* fs.exists(packagedExecutable).pipe(Effect.orElseSucceed(() => false)))
      ? packagedExecutable
      : undefined);
  const runtimePath = path.join(home.directory, "core", "runtime.json");
  const verified = yield* Ref.make<Option.Option<string>>(Option.none());
  const lock = yield* Semaphore.make(1);
  const readRuntime = fs.readFileString(runtimePath).pipe(Effect.option);
  const readVersion = Effect.fn("AgentShareCoreInstallation.readVersion")((binary: string) =>
    spawner
      .string(
        ChildProcess.make(binary, ["version", "--json"], {
          env,
          extendEnv: false,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "ignore",
        }),
      )
      .pipe(
        Effect.timeout("5 seconds"),
        Effect.flatMap(decodeVersion),
        Effect.mapError(
          (cause) =>
            new AgentShareCoreError({ operation: "prepare", category: "invalid-runtime", cause }),
        ),
      ),
  );

  const prepare = Effect.fn("AgentShareCoreInstallation.prepare")(function* () {
    if (!executable) return;
    if (!path.isAbsolute(executable)) {
      return yield* new AgentShareCoreError({
        operation: "prepare",
        category: "invalid-runtime",
      });
    }
    const runtime = yield* readRuntime;
    const previous = yield* Ref.get(verified);
    if (Option.isSome(runtime) && Option.isSome(previous) && runtime.value === previous.value)
      return;

    const installed = path.join(
      home.directory,
      "bin",
      platform === "win32" ? "agentshare-runtime.exe" : "agentshare-runtime",
    );
    if (yield* fs.exists(installed).pipe(Effect.orElseSucceed(() => false))) {
      const candidate = yield* readVersion(executable);
      const current = yield* readVersion(installed);
      if (!parseSemver(candidate.version) || !parseSemver(current.version)) {
        return yield* new AgentShareCoreError({
          operation: "prepare",
          category: "invalid-runtime",
        });
      }
      if (compareSemverVersions(candidate.version, current.version) < 0) {
        if (Option.isSome(runtime)) {
          const identity = yield* installedCore
            .identity()
            .pipe(Effect.timeout("5 seconds"), Effect.option);
          if (
            Option.isSome(identity) &&
            identity.value.version === current.version &&
            !identity.value.stopping
          ) {
            yield* Ref.set(verified, runtime);
            return;
          }
        }
        return yield* new AgentShareCoreError({
          operation: "prepare",
          category: "rejected",
          status: 409,
        });
      }
    }

    // Go owns the durable copy, safe upgrade, detached Core and CLI; this scope owns only its installer.
    yield* Effect.scoped(
      Effect.gen(function* () {
        const consoleUrl = env.AGENTSHARE_CONSOLE_URL?.trim();
        const command = ChildProcess.make(
          executable,
          [
            "install",
            "--management-only",
            "--no-open",
            ...(consoleUrl ? ["--console", consoleUrl] : []),
          ],
          {
            env: { ...env, AGENTSHARE_HOME: home.directory },
            extendEnv: false,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          },
        );
        const child = yield* spawner.spawn(command);
        const exitCode = yield* child.exitCode;
        if (exitCode !== 0) {
          return yield* new AgentShareCoreError({
            operation: "prepare",
            category: "unavailable",
          });
        }
      }),
    ).pipe(
      Effect.timeout("22 minutes"),
      Effect.mapError((cause) =>
        isCoreError(cause)
          ? cause
          : new AgentShareCoreError({
              operation: "prepare",
              category: "unavailable",
              cause,
            }),
      ),
    );
    const ready = yield* readRuntime;
    if (Option.isNone(ready)) {
      return yield* new AgentShareCoreError({ operation: "prepare", category: "unavailable" });
    }
    yield* Ref.set(verified, ready);
  }, lock.withPermit);

  return CoreClient.CoreBootstrap.of({
    prepare: prepare(),
    invalidate: Ref.set(verified, Option.none()),
  });
});

export const layer = Layer.effect(CoreClient.CoreBootstrap, make).pipe(
  // Give the probe its own client so the managed client still runs this bootstrap.
  Layer.provide(Layer.fresh(CoreClient.layer).pipe(Layer.provide(CoreClient.layerExternalCore))),
);
