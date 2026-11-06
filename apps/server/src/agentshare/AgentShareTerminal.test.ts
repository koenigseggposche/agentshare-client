import * as CoreClient from "@agentshare/core-client/CoreClient";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import type { AgentSharePrepareTerminalInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import * as ServerSettings from "../serverSettings.ts";
import * as TerminalManager from "../terminal/Manager.ts";
import * as AgentShare from "./AgentShare.ts";

const input: AgentSharePrepareTerminalInput = {
  owner: "generated-owner",
  model: {
    id: "generated-model",
    service: "codex",
    source: "owned",
    runtime: "codex",
    device: "generated-device",
    policy: "generated-policy",
  },
  directory: "/generated/project",
  threadId: "generated-cli-thread",
  terminalId: "generated-terminal",
};

const fixture = Effect.fn("AgentShareTerminal.test.fixture")(function* (
  options: {
    shell?: string;
    owners?: readonly string[];
    features?: readonly string[];
    binary?: string;
    home?: string;
  } = {},
) {
  const calls = { identity: 0, tools: 0, shell: 0 };
  const service = yield* AgentShare.AgentShare.pipe(
    Effect.provide(
      AgentShare.layer.pipe(
        Layer.provide(NodeServices.layer),
        Layer.provide(NodeCrypto.layer),
        Layer.provide(Layer.mock(ServerSettings.ServerSettingsService)({})),
        Layer.provide(
          Layer.mock(TerminalManager.TerminalManager)({
            getShell: (target) =>
              Effect.sync(() => {
                assert.deepEqual(target, {
                  threadId: input.threadId,
                  terminalId: input.terminalId,
                });
                calls.shell++;
                return options.shell ?? "/bin/sh";
              }),
          }),
        ),
        Layer.provide(
          Layer.mock(CoreClient.CoreClient)({
            identity: () =>
              Effect.sync(() => ({
                api_version: 1,
                version: "generated",
                revision: "generated",
                owner: options.owners?.[calls.identity++] ?? input.owner,
                device_id: "generated",
                paired: true,
                stopping: false,
                features: [...(options.features ?? ["interactive-cli"])],
              })),
            read: () =>
              Effect.sync(() => {
                calls.tools++;
                return {
                  launcher: {
                    binary: options.binary ?? "/generated/core",
                    home: options.home ?? "/generated/home",
                  },
                  environment: { private: "generated-host-secret" },
                };
              }),
          }),
        ),
      ),
    ),
  );
  return { service, calls };
});

it.layer(NodeServices.layer)("managed terminal preparation", (it) => {
  it.effect.skipIf(HostProcess.Platform.defaultValue() === "win32")(
    "passes quoted directory and model arguments literally through a real POSIX shell",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "tmp." });
        const binary = path.join(root, "generated ' $(printf injected)");
        yield* fs.writeFileString(binary, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
        yield* fs.chmod(binary, 0o700);
        const { service } = yield* fixture({ binary });
        const directory = path.join(root, "project ' $(printf unexpected) ");
        const result = yield* service.prepareTerminal({ ...input, directory });
        assert.notInclude(result.command, "generated-host-secret");
        const output = yield* spawner.string(ChildProcess.make("/bin/sh", ["-c", result.command]));
        assert.deepEqual(output.trimEnd().split("\n"), [
          "workbench-cli",
          "--home",
          "/generated/home",
          "--owner",
          input.owner,
          "--model",
          input.model.id,
          "--source",
          "owned",
          "--service",
          "codex",
          "--runtime",
          "codex",
          "--directory",
          directory,
          "--device",
          "generated-device",
          "--policy",
          "generated-policy",
          "--",
        ]);
      }).pipe(Effect.scoped),
  );

  it.effect("quotes PowerShell arguments without expanding substitutions or smart quotes", () =>
    Effect.gen(function* () {
      const { service } = yield* fixture({
        shell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        binary: "/generated/core'‘’`$(value)",
      });
      const result = yield* service.prepareTerminal(input);
      assert.isTrue(result.command.startsWith("& '/generated/core''‘‘’’`$(value)' "));
      assert.notInclude(result.command, "generated-host-secret");
    }),
  );

  it.effect("rejects another account and an older Core before reading launch metadata", () =>
    Effect.gen(function* () {
      for (const options of [{ owners: ["other-owner"] }, { features: [] }]) {
        const { service, calls } = yield* fixture(options);
        const error = yield* service.prepareTerminal(input).pipe(Effect.flip);
        assert.equal(error.category, "owners" in options ? "denied" : "invalid-runtime");
        assert.equal(calls.tools, 0);
        assert.equal(calls.shell, 0);
      }
    }),
  );

  it.effect("rejects an account change while preparing the terminal command", () =>
    Effect.gen(function* () {
      const { service } = yield* fixture({ owners: [input.owner, "other-owner"] });
      const error = yield* service.prepareTerminal(input).pipe(Effect.flip);
      assert.equal(error.category, "denied");
      assert.isUndefined(error.cause);
    }),
  );

  it.effect("rejects unsupported shells, relative launchers and control characters", () =>
    Effect.gen(function* () {
      for (const [options, request] of [
        [{ shell: "/bin/nu" }, input],
        [{ binary: "relative-core" }, input],
        [{}, { ...input, directory: "/generated/project\nexit" }],
        [{}, { ...input, model: { ...input.model, runtime: "text" as const } }],
      ] as const) {
        const { service } = yield* fixture(options);
        const error = yield* service.prepareTerminal(request).pipe(Effect.flip);
        assert.isTrue(["invalid-operation", "invalid-runtime"].includes(error.category));
        assert.isUndefined(error.cause);
      }
    }),
  );
});
