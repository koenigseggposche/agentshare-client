import * as NodeServices from "@effect/platform-node/NodeServices";
import * as CoreClient from "@agentshare/core-client/CoreClient";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import * as CoreInstallation from "./CoreInstallation.ts";

const fixture = Effect.fn("CoreInstallation.test.fixture")(function* (options?: {
  readonly executable?: string | null;
  readonly createRuntime?: boolean;
  readonly installedVersion?: string;
  readonly candidateVersion?: string;
  readonly standalone?: boolean;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "generated-bootstrap-" });
  const runtimePath = path.join(directory, "core", "runtime.json");
  const clientExecutable = path.join(directory, "release", "t3");
  const bundledCore = path.join(directory, "release", "agentshare-core", "agentshare-core");
  if (options?.standalone !== undefined) {
    yield* fs.makeDirectory(path.dirname(bundledCore), { recursive: true });
    yield* fs.writeFileString(bundledCore, "generated bundled core");
  }
  const commands: ChildProcess.StandardCommand[] = [];
  const installed = path.join(directory, "bin", "agentshare-runtime");
  if (options?.installedVersion) {
    yield* fs.makeDirectory(path.dirname(installed), { recursive: true });
    yield* fs.writeFileString(installed, "generated existing runtime");
  }
  let exitCode = 0;
  const spawner = ChildProcessSpawner.make((command) =>
    Effect.gen(function* () {
      assert.equal(command._tag, "StandardCommand");
      if (command._tag !== "StandardCommand") return yield* Effect.die("unexpected pipeline");
      if (command.args[0] === "version") {
        const version =
          command.command === installed ? options?.installedVersion : options?.candidateVersion;
        return ChildProcessSpawner.makeHandle({
          pid: ChildProcessSpawner.ProcessId(124),
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          unref: Effect.succeed(Effect.void),
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(JSON.stringify({ version }))),
          stderr: Stream.empty,
          all: Stream.empty,
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
        });
      }
      commands.push(command);
      if (exitCode === 0 && options?.createRuntime !== false) {
        yield* fs.makeDirectory(path.dirname(runtimePath), { recursive: true });
        yield* fs.writeFileString(runtimePath, `generated-runtime-${commands.length}`);
      }
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(123),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.empty,
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );
  const executable =
    options?.executable === undefined ? path.join(directory, "bundled core") : options.executable;
  const service = yield* CoreClient.CoreBootstrap.pipe(
    Effect.provide(
      CoreInstallation.layer.pipe(
        Layer.provide(
          Layer.mergeAll(
            Layer.succeed(CoreClient.CoreHome, { directory }),
            Layer.succeed(HostProcess.Platform, "darwin"),
            Layer.succeed(HostProcess.IsExecutable, options?.standalone ?? false),
            Layer.succeed(HostProcess.ExecutablePath, clientExecutable),
            Layer.succeed(HostProcess.Environment, {
              ...(executable === null ? {} : { AGENTSHARE_CORE_EXECUTABLE: executable }),
              AGENTSHARE_CONSOLE_URL: "https://console.example.test/console",
            }),
            Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
          ),
        ),
      ),
    ),
  );
  return {
    service,
    commands,
    directory,
    runtimePath,
    executable,
    bundledCore,
    setExitCode: (value: number) => {
      exitCode = value;
    },
  };
});

it.layer(NodeServices.layer)("CoreInstallation", (it) => {
  it.effect("serializes preparation and rechecks a replaced or invalidated runtime", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const f = yield* fixture();
      yield* Effect.all(
        Array.from({ length: 20 }, () => f.service.prepare),
        { concurrency: "unbounded" },
      );
      assert.equal(f.commands.length, 1);
      const command = f.commands[0]!;
      assert.equal(command.command, f.executable);
      assert.deepEqual(command.args, [
        "install",
        "--management-only",
        "--no-open",
        "--console",
        "https://console.example.test/console",
      ]);
      assert.equal(command.options.env?.AGENTSHARE_HOME, f.directory);
      assert.equal(command.options.stdout, "ignore");
      assert.equal(command.options.stderr, "ignore");
      yield* f.service.invalidate;
      yield* f.service.prepare;
      assert.equal(f.commands.length, 2);
      yield* fs.writeFileString(f.runtimePath, "replacement-runtime");
      yield* f.service.prepare;
      assert.equal(f.commands.length, 3);
    }).pipe(Effect.scoped),
  );

  it.effect("does not cache a failed installer or replay the caller operation", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      f.setExitCode(1);
      const failure = yield* f.service.prepare.pipe(Effect.flip);
      assert.equal(failure.category, "unavailable");
      assert.equal(f.commands.length, 1);
      f.setExitCode(0);
      yield* f.service.prepare;
      assert.equal(f.commands.length, 2);
      yield* f.service.prepare;
      assert.equal(f.commands.length, 2);
    }).pipe(Effect.scoped),
  );

  it.effect("requires a runtime receipt even when the installer exits successfully", () =>
    Effect.gen(function* () {
      const f = yield* fixture({ createRuntime: false });
      const failure = yield* f.service.prepare.pipe(Effect.flip);
      assert.equal(failure.category, "unavailable");
    }).pipe(Effect.scoped),
  );

  it.effect.each([false, true])(
    "uses the adjacent Core only in a standalone executable (%s)",
    (standalone) =>
      Effect.gen(function* () {
        const f = yield* fixture({ executable: null, standalone });
        yield* f.service.prepare;
        assert.equal(f.commands.length, standalone ? 1 : 0);
        if (standalone) assert.equal(f.commands[0]?.command, f.bundledCore);
      }).pipe(Effect.scoped),
  );

  it.effect("rejects relative executable lookup before spawning", () =>
    Effect.gen(function* () {
      const f = yield* fixture({ executable: "agentshare-core" });
      const failure = yield* f.service.prepare.pipe(Effect.flip);
      assert.equal(failure.category, "invalid-runtime");
      assert.equal(f.commands.length, 0);
    }).pipe(Effect.scoped),
  );
  it.effect.each([
    { current: "0.6.26", candidate: "0.5.0-migration", category: "rejected" },
    { current: "0.6.26", candidate: "0.6.26-preview.1", category: "rejected" },
    { current: "dev", candidate: "0.6.27-preview.1", category: "invalid-runtime" },
  ])(
    "preserves an installed $current runtime when the candidate is $candidate",
    ({ current, candidate, category }) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const f = yield* fixture({ installedVersion: current, candidateVersion: candidate });
        const failure = yield* f.service.prepare.pipe(Effect.flip);
        assert.equal(failure.category, category);
        assert.equal(f.commands.length, 0);
        assert.equal(
          yield* fs.readFileString(path.join(f.directory, "bin", "agentshare-runtime")),
          "generated existing runtime",
        );
      }).pipe(Effect.scoped),
  );

  it.effect("allows a newer compatible candidate to use the safe Go installation path", () =>
    Effect.gen(function* () {
      const f = yield* fixture({
        installedVersion: "0.6.26",
        candidateVersion: "0.6.27-preview.1",
      });
      yield* f.service.prepare;
      assert.equal(f.commands.length, 1);
    }).pipe(Effect.scoped),
  );
});
