import * as NodeUtil from "node:util";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { Command, Flag, GlobalFlag, Prompt } from "effect/cli";
import { FetchHttpClient } from "effect/http";

import packageJson from "../../package.json" with { type: "json" };
import * as BootService from "../cloud/bootService.ts";
import * as ServiceProtection from "../cloud/serviceProtection.ts";
import { compareExactServiceVersions, SERVICE_ENV_FILE } from "../cloud/serviceProtocol.ts";
import * as ServerConfig from "../config.ts";
import * as ProcessRunner from "../processRunner.ts";
import { projectLocationFlags, resolveCliAuthConfig } from "./config.ts";
import { resolveEntryPath } from "./invocation.ts";

export const layer = (config: ServerConfig.ServerConfig["Service"]) =>
  BootService.layer({
    baseDir: config.baseDir,
    logsDir: config.logsDir,
    cliVersion: packageJson.version,
  }).pipe(Layer.provide(ProcessRunner.layer), Layer.provide(FetchHttpClient.layer));

export type ServiceReconcileResult =
  | {
      readonly changed: false;
      readonly status: BootService.BootServiceStatus;
    }
  | {
      readonly changed: true;
      readonly previouslyInstalled: boolean;
      readonly plan: BootService.BootServicePlan;
    };

const SERVICE_ENV_KEY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u;

/**
 * Sets or removes (`undefined`) entries in `service.env` text and keeps every
 * other line, including comments, as the user wrote it.
 */
export const upsertServiceEnv = (
  contents: string,
  entries: Readonly<Record<string, string | undefined>>,
): string => {
  const written = new Set<string>();
  const lines = contents.split("\n").flatMap((line) => {
    const key = SERVICE_ENV_KEY.exec(line)?.[1];
    if (key === undefined || !Object.hasOwn(entries, key)) return [line];
    const value = entries[key];
    if (value === undefined || written.has(key)) return [];
    written.add(key);
    return [`${key}=${value}`];
  });
  while (lines.at(-1) === "") lines.pop();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && !written.has(key)) lines.push(`${key}=${value}`);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
};

/** `service.env` under `baseDir`, parsed as the service launcher parses it. */
export const readServiceEnv = Effect.fn("cli.service.read_env")(function* (baseDir: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = (yield* Path.Path).join(baseDir, SERVICE_ENV_FILE);
  const contents = (yield* fs.exists(path)) ? yield* fs.readFileString(path) : "";
  const entries = Object.entries(NodeUtil.parseEnv(contents)).flatMap(([key, value]) =>
    value === undefined ? [] : [[key, value] as const],
  );
  return { path, contents, entries: Object.fromEntries(entries) };
});

export const writeServiceEnv = Effect.fn("cli.service.write_env")(function* (
  baseDir: string,
  entries: Readonly<Record<string, string | undefined>>,
) {
  const fs = yield* FileSystem.FileSystem;
  const current = yield* readServiceEnv(baseDir);
  const next = upsertServiceEnv(current.contents, entries);
  if (next === current.contents) return;
  yield* fs.makeDirectory(baseDir, { recursive: true });
  yield* fs.writeFileString(current.path, next);
});

export const reconcileService = Effect.fn("cli.service.reconcile")(function* (options?: {
  readonly allowDowngrade?: boolean;
  readonly start?: boolean;
}) {
  const { baseDir } = yield* ServerConfig.ServerConfig;
  const service = yield* BootService.BootService;
  const status = yield* service.status;
  if (status.installed && status.current) {
    return { changed: false, status } satisfies ServiceReconcileResult;
  }
  if (status.supported && !status.installed) {
    // A new service listens on this machine only, until `agentshare-client up` opens the local network.
    const { entries } = yield* readServiceEnv(baseDir);
    if (
      entries.AGENTSHARE_CLIENT_LAN === undefined &&
      entries.AGENTSHARE_CLIENT_HOST === undefined
    ) {
      yield* writeServiceEnv(baseDir, { AGENTSHARE_CLIENT_LAN: "false" });
    }
  }
  if (
    status.installedVersion !== undefined &&
    options?.allowDowngrade !== true &&
    compareExactServiceVersions(packageJson.version, status.installedVersion) < 0
  ) {
    return yield* new BootService.BootServiceDowngradeRefusedError({
      installedVersion: status.installedVersion,
      targetVersion: packageJson.version,
    });
  }
  const plan = yield* service.install(options);
  return {
    changed: true,
    previouslyInstalled: status.installed,
    plan,
  } satisfies ServiceReconcileResult;
});

export function formatServiceChange(
  result: Extract<ServiceReconcileResult, { readonly changed: true }>,
): string {
  if (result.plan.handedOff === true) {
    return `Service update to agentshare-client@${packageJson.version} queued. This session will disconnect.\nLog: ${result.plan.logPath}`;
  }
  return `Service ${result.previouslyInstalled ? "updated" : "installed"} · agentshare-client@${packageJson.version}\nLog: ${result.plan.logPath}`;
}

function formatProtection(
  protection: ServiceProtection.ServiceProtectionState | undefined,
): ReadonlyArray<string> {
  if (protection === undefined) return [];
  return [
    protection.unprotected === undefined
      ? `  Memory protection: on${protection.setByProtect ? " (agentshare-client service protect)" : ""}`
      : `  Memory protection: off, ${protection.unprotected} grants none. Run \`agentshare-client service protect\`.`,
    ...(protection.oomScoreAdj === undefined ? [] : [`  OOM score: ${protection.oomScoreAdj}`]),
  ];
}

function formatServiceStatus(
  status: BootService.BootServiceStatus,
  cliVersion: string,
  protection?: ServiceProtection.ServiceProtectionState,
): string {
  if (!status.supported) {
    return "AgentShare Client service\n  Status: unavailable on this machine\n  Supported on: Linux with systemd, macOS with launchd";
  }
  if (!status.installed) {
    return "AgentShare Client service\n  Status: not installed\n  Next: Run `agentshare-client service install`.";
  }
  const installedVersion = status.installedVersion ?? cliVersion;
  const problems = (status.problems ?? []).map(
    (problem) => `  [${problem}] ${BootService.formatBootServiceProblem(problem)}`,
  );
  if (
    !status.current &&
    status.installedVersion !== undefined &&
    compareExactServiceVersions(status.installedVersion, cliVersion) > 0
  ) {
    return [
      "AgentShare Client service",
      `  Status: installed · agentshare-client@${installedVersion} (newer than this agentshare-client@${cliVersion} CLI)`,
      `  Unit: ${status.unitPath}`,
      `  Logs: ${status.logPath}`,
      ...formatProtection(protection),
      ...problems,
      `  Next: Run \`agentshare-client update ${installedVersion}\` to match it, or pass \`--allow-downgrade\` to \`agentshare-client service install\` explicitly.`,
    ].join("\n");
  }
  return [
    "AgentShare Client service",
    `  Status: ${status.current ? `installed · agentshare-client@${installedVersion}` : "needs an update or repair"}`,
    `  Unit: ${status.unitPath}`,
    `  Logs: ${status.logPath}`,
    ...formatProtection(protection),
    ...problems,
    ...(status.current ? [] : ["  Next: Run `agentshare-client service install` to repair it."]),
  ].join("\n");
}

const runServiceCommand = Effect.fn("cli.service.run")(function* <A, E, R>(
  flags: { readonly baseDir: Parameters<typeof resolveCliAuthConfig>[0]["baseDir"] },
  run: Effect.Effect<A, E, R>,
) {
  const logLevel = yield* GlobalFlag.LogLevel;
  const config = yield* resolveCliAuthConfig(flags, logLevel);
  return yield* run.pipe(Effect.provide(Layer.merge(layer(config), ServerConfig.layer(config))));
});

const serviceReconcileFlags = {
  ...projectLocationFlags,
  allowDowngrade: Flag.Boolean("allow-downgrade").pipe(
    Flag.withDescription("Allow replacing a newer installed service with this older CLI version."),
    Flag.withDefault(false),
  ),
};

const serviceInstallCommand = Command.make("install", serviceReconcileFlags).pipe(
  Command.withDescription(
    "Install the AgentShare workbench as a background service for this user.",
  ),
  Command.withHandler((flags) =>
    runServiceCommand(
      flags,
      Effect.gen(function* () {
        const result = yield* reconcileService({ allowDowngrade: flags.allowDowngrade });
        if (!result.changed) {
          yield* Console.log(
            `AgentShare Client service is already installed with agentshare-client@${packageJson.version} (${yield* resolveEntryPath}).`,
          );
          return;
        }
        yield* Console.log(formatServiceChange(result));
        if (!result.previouslyInstalled) {
          yield* Console.log(
            "Run `agentshare-client up` to choose how your other devices reach it.",
          );
        }
      }),
    ),
  ),
);

const serviceUpdateCommand = Command.make("update", serviceReconcileFlags).pipe(
  Command.withDescription("Deprecated. Run `agentshare-client update` to move to a newer release."),
  Command.unlisted,
  Command.withHandler((flags) =>
    runServiceCommand(
      flags,
      Effect.gen(function* () {
        yield* Console.log(
          "`agentshare-client service update` is deprecated: run `agentshare-client update` to move to a newer release, or `agentshare-client service install` to repair the service. Repairing now.",
        );
        const result = yield* reconcileService({ allowDowngrade: flags.allowDowngrade });
        if (!result.changed) {
          yield* Console.log(
            `AgentShare Client service is already using agentshare-client@${packageJson.version} (${yield* resolveEntryPath}).`,
          );
          return;
        }
        yield* Console.log(formatServiceChange(result));
      }),
    ),
  ),
);

const serviceRestartCommand = Command.make("restart", projectLocationFlags).pipe(
  Command.withDescription(
    "Restart the background service. Picks up a version installed by `agentshare-client update` that was not restarted at the time.",
  ),
  Command.withHandler((flags) =>
    runServiceCommand(
      flags,
      Effect.gen(function* () {
        const service = yield* BootService.BootService;
        const status = yield* service.status;
        const outcome = yield* service.restart;
        const onVersion =
          status.installedVersion === undefined
            ? ""
            : ` on agentshare-client@${status.installedVersion}`;
        yield* Console.log(
          outcome === "restarted"
            ? `Restarted the AgentShare Client service${onVersion}.`
            : outcome === "queued"
              ? `Queued a restart of the AgentShare Client service${onVersion}. This session runs inside the service and disconnects when it goes down.\nLogs: ${status.logPath}`
              : "AgentShare Client service is not installed.",
        );
      }),
    ),
  ),
);

const serviceUninstallCommand = Command.make("uninstall", projectLocationFlags).pipe(
  Command.withDescription("Stop and remove the AgentShare Client background service."),
  Command.withHandler((flags) =>
    runServiceCommand(
      flags,
      Effect.gen(function* () {
        const service = yield* BootService.BootService;
        const path = yield* Path.Path;
        const { baseDir } = yield* ServerConfig.ServerConfig;
        // An unreadable unit stays removable; only a unit known to serve another home is kept.
        const installedBaseDir = yield* service.status.pipe(
          Effect.map((status) => status.installedBaseDir),
          Effect.orElseSucceed(() => undefined),
        );
        if (
          installedBaseDir !== undefined &&
          path.resolve(installedBaseDir) !== path.resolve(baseDir)
        ) {
          yield* Console.log(
            "The installed service runs another workbench data directory, so it was not removed. Pass its --base-dir.",
          );
          return;
        }
        const removed = yield* service.uninstall;
        yield* Console.log(
          removed
            ? "Removed the AgentShare Client service."
            : "AgentShare Client service is not installed.",
        );
      }),
    ),
  ),
);

const serviceStatusCommand = Command.make("status", projectLocationFlags).pipe(
  Command.withDescription("Show whether the AgentShare Client background service is installed."),
  Command.withHandler((flags) =>
    runServiceCommand(
      flags,
      Effect.gen(function* () {
        const service = yield* BootService.BootService;
        const path = yield* Path.Path;
        const status = yield* service.status;
        const protection =
          status.installed && (yield* HostProcess.Platform) === "linux"
            ? yield* ServiceProtection.readProtection(path.dirname(status.unitPath)).pipe(
                Effect.provide(ProcessRunner.layer),
              )
            : undefined;
        yield* Console.log(formatServiceStatus(status, packageJson.version, protection));
      }),
    ),
  ),
);

const formatDropIns = (dropIns: ReadonlyArray<ServiceProtection.DropIn>) =>
  dropIns.map(
    ({ path, contents }) => `  ${path}: ${contents.trimEnd().split("\n").slice(1).join(" ")}`,
  );

const confirm = (yes: boolean, message: string) =>
  yes ? Effect.succeed(true) : Prompt.run(Prompt.Confirm({ message, initial: false }));

const serviceProtectCommand = Command.make("protect", {
  ...projectLocationFlags,
  undo: Flag.Boolean("undo").pipe(
    Flag.withDescription("Remove the protection this command set up."),
    Flag.withDefault(false),
  ),
  yes: Flag.Boolean("yes").pipe(
    Flag.withDescription("Answer yes to every question, including SSH and Tailscale."),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription(
    "Protect the AgentShare Client server from agents under memory pressure (Linux with systemd). Asks for sudo.",
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const unsupported = "Service protection needs Linux with systemd.";
      if ((yield* HostProcess.Platform) !== "linux") return yield* Console.log(unsupported);
      // Before resolving config, which creates T3 directories that root would then own.
      if ((yield* HostProcess.UserId) === 0) {
        return yield* Console.log(
          "Run `agentshare-client service protect` as the user that runs AgentShare Client, without sudo. It asks for sudo when it needs root.",
        );
      }
      return yield* runServiceCommand(
        flags,
        Effect.gen(function* () {
          const uid = yield* HostProcess.UserId;
          const remote = yield* ServiceProtection.detectRemoteAccessUnits;
          const { unitPath } = yield* (yield* BootService.BootService).status;
          if (uid === undefined || remote === undefined || unitPath === "") {
            return yield* Console.log(unsupported);
          }
          const userUnitDir = (yield* Path.Path).dirname(unitPath);

          if (flags.undo) {
            const installed = yield* ServiceProtection.installedProtection(
              ServiceProtection.protectionPlan({
                uid,
                userUnitDir,
                remoteAccessUnits: ServiceProtection.REMOTE_ACCESS_UNITS,
              }),
            );
            if (installed === undefined) {
              return yield* Console.log("AgentShare Client service protection is not set up.");
            }
            yield* Console.log(
              [
                "Removes:",
                ...[...installed.system, ...installed.user, installed.managerDefaults].map(
                  ({ path, shared }) =>
                    `  ${path}${shared === true ? " (kept while another user is protected)" : ""}`,
                ),
              ].join("\n"),
            );
            if (!(yield* confirm(flags.yes, "Remove AgentShare Client service protection?")))
              return;
            yield* ServiceProtection.removeProtection(installed);
            return yield* Console.log(
              "Removed AgentShare Client service protection. The server's OOM score returns to normal after `agentshare-client service restart`.",
            );
          }

          yield* Console.log(
            [
              "Keeps AgentShare Client running when agents fill this machine's memory:",
              "  - reserves memory for the AgentShare Client server, so the kernel takes memory from agents first",
              "  - makes the out-of-memory killer pick agents before the server",
              "It adds systemd drop-in files and changes nothing else. Undo with `agentshare-client service protect --undo`.",
            ].join("\n"),
          );
          const names = remote.map((unit) => unit.replace(/\.service$/, "")).join(" and ");
          const protectRemote =
            remote.length > 0 &&
            (yield* confirm(
              flags.yes,
              `Also protect ${names} so you can still reach this machine under memory pressure?`,
            ));
          const plan = ServiceProtection.protectionPlan({
            uid,
            userUnitDir,
            remoteAccessUnits: protectRemote ? remote : [],
          });
          yield* Console.log(
            [
              "Drop-ins it writes, as root through sudo:",
              ...formatDropIns(plan.system),
              "As you:",
              ...formatDropIns([plan.managerDefaults, ...plan.user]),
            ].join("\n"),
          );
          if (!(yield* confirm(flags.yes, "Apply these settings?"))) return;
          yield* ServiceProtection.applyProtection(plan);
          yield* Console.log(
            "Protected AgentShare Client. Memory protection applies now; the server takes its OOM score after `agentshare-client service restart`. Undo with `agentshare-client service protect --undo`.",
          );
        }).pipe(Effect.provide(ProcessRunner.layer)),
      );
    }),
  ),
);

export const serviceCommand = Command.make("service").pipe(
  Command.withDescription("Manage the AgentShare Client background service."),
  Command.withSubcommands([
    serviceInstallCommand,
    serviceRestartCommand,
    serviceUninstallCommand,
    serviceStatusCommand,
    serviceProtectCommand,
    serviceUpdateCommand,
  ]),
);
