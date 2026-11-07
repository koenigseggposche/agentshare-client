// @effect-diagnostics nodeBuiltinImport:off - CLI tests use an isolated Core HTTP server.
import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";

const testOwner = "generated-pair-owner";
const testCapability = "generated-pair-capability";

export const testAccountProfilePath = (baseDir: string) =>
  NodePath.join(
    baseDir,
    "accounts",
    NodeCrypto.createHash("sha256").update(testOwner).digest("hex"),
    "userdata",
  );

export const withCliAccountFixture = <A, E, R>(
  command: Effect.Effect<A, E, R>,
  args: ReadonlyArray<string>,
  environmentId?: string,
) => {
  const baseDirFlag = args.indexOf("--base-dir");
  const baseDir = baseDirFlag < 0 ? undefined : args[baseDirFlag + 1];
  if (baseDir === undefined) return command;

  return Effect.acquireUseRelease(
    Effect.callback<NodeHttp.Server>((resume) => {
      const server = NodeHttp.createServer((request, response) => {
        if (
          request.url !== "/v1/workbench" ||
          request.headers.authorization !== `Bearer ${testCapability}`
        ) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            api_version: 1,
            version: "generated",
            revision: "generated",
            owner: testOwner,
            account_generation: 1,
            device_id: "generated-device",
            paired: true,
            stopping: false,
            features: [],
          }),
        );
      });
      server.listen(0, "127.0.0.1", () => resume(Effect.succeed(server)));
    }),
    (server) => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        return Effect.die(new Error("Expected a TCP address"));
      }
      const coreHome = NodePath.join(baseDir, "core-fixture");
      const runtimeDir = NodePath.join(coreHome, "core");
      NodeFS.mkdirSync(runtimeDir, { recursive: true });
      NodeFS.writeFileSync(
        NodePath.join(runtimeDir, "runtime.json"),
        JSON.stringify({
          url: `http://127.0.0.1:${address.port}`,
          capability: testCapability,
          pid: process.pid,
        }),
        { mode: 0o600 },
      );
      if (environmentId !== undefined) {
        const profileRoot = NodePath.dirname(testAccountProfilePath(baseDir));
        for (const variant of ["dev", "userdata"]) {
          const profile = NodePath.join(profileRoot, variant);
          NodeFS.mkdirSync(profile, { recursive: true });
          NodeFS.writeFileSync(NodePath.join(profile, "environment-id"), environmentId);
        }
      }
      return command.pipe(
        Effect.provideService(HostProcess.Environment, {
          ...process.env,
          AGENTSHARE_HOME: coreHome,
          AGENTSHARE_CORE_EXECUTABLE: "",
        }),
      );
    },
    (server) => Effect.sync(() => server.close()),
  );
};
