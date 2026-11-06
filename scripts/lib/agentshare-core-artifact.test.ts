// @effect-diagnostics nodeBuiltinImport:off - Generated executable headers exercise release validation without executing binaries.
import * as NodeBuffer from "node:buffer";
import * as NodeCrypto from "node:crypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  loadCoreArtifact,
  stageCoreArtifact,
  verifyPackagedCore,
} from "./agentshare-core-artifact.ts";

const fixture = Effect.fn("coreArtifact.test.fixture")(function* (
  platform: "mac" | "linux" | "win" = "mac",
  arch: "arm64" | "x64" | "universal" = "arm64",
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "generated-release-" });
  const bytes = NodeBuffer.Buffer.alloc(128);
  if (platform === "mac") {
    if (arch === "universal") {
      bytes.writeUInt32BE(0xcafebabe, 0);
      bytes.writeUInt32BE(2, 4);
      bytes.writeUInt32BE(0x1000007, 8);
      bytes.writeUInt32BE(0x100000c, 28);
    } else {
      bytes.writeUInt32LE(0xfeedfacf, 0);
      bytes.writeUInt32LE(arch === "arm64" ? 0x100000c : 0x1000007, 4);
    }
  } else if (platform === "linux") {
    bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1]);
    bytes.writeUInt16LE(arch === "arm64" ? 183 : 62, 18);
  } else {
    bytes.set([0x4d, 0x5a]);
    bytes.writeUInt32LE(64, 60);
    bytes.writeUInt32LE(0x4550, 64);
    bytes.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 68);
  }
  const manifest = {
    schema: 1,
    api_version: 1,
    version: "0.6.27-preview.1",
    revision: "generated-revision",
    platform: platform === "mac" ? "darwin" : platform === "win" ? "win32" : "linux",
    arch,
    binary: platform === "win" ? "core.exe" : "core",
    size: bytes.length,
    sha256: NodeCrypto.createHash("sha256").update(bytes).digest("hex"),
    source_dirty: false,
    source_tree_sha256: "a".repeat(64),
  };
  const manifestPath = path.join(root, "manifest.json");
  const writeManifest = Effect.fn("coreArtifact.test.writeManifest")(
    (changes: Record<string, unknown>) =>
      fs.writeFileString(manifestPath, JSON.stringify({ ...manifest, ...changes })),
  );
  yield* writeManifest({});
  yield* fs.writeFile(path.join(root, manifest.binary), bytes);
  return { fs, path, root, bytes, manifest, manifestPath, writeManifest, platform, arch };
});

it.layer(NodeServices.layer)("AgentShare Core release artifacts", (it) => {
  it.effect.each([
    { platform: "mac", arch: "arm64" },
    { platform: "mac", arch: "x64" },
    { platform: "mac", arch: "universal" },
    { platform: "linux", arch: "arm64" },
    { platform: "linux", arch: "x64" },
    { platform: "win", arch: "arm64" },
    { platform: "win", arch: "x64" },
  ] as const)(
    "stages the verified $platform/$arch runtime and its release identity",
    ({ platform, arch }) =>
      Effect.gen(function* () {
        const f = yield* fixture(platform, arch);
        const artifact = yield* loadCoreArtifact({ manifestPath: f.manifestPath, platform, arch });
        const destination = f.path.join(f.root, "resources");
        yield* stageCoreArtifact(artifact, destination);
        const binary = platform === "win" ? "agentshare-core.exe" : "agentshare-core";
        assert.deepEqual(
          [...(yield* f.fs.readFile(f.path.join(destination, binary)))],
          [...f.bytes],
        );
        assert.deepEqual(
          JSON.parse(yield* f.fs.readFileString(f.path.join(destination, "manifest.json"))),
          { ...f.manifest, binary },
        );
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    { name: "wrong architecture", changes: { arch: "x64" }, stage: "target" },
    { name: "wrong platform", changes: { platform: "linux" }, stage: "target" },
    { name: "changed bytes", changes: { sha256: "0".repeat(64) }, stage: "hash" },
    { name: "truncated payload", changes: { size: 129 }, stage: "size" },
    { name: "parent path", changes: { binary: "../core" }, stage: "manifest" },
    { name: "incompatible protocol", changes: { api_version: 2 }, stage: "manifest" },
    { name: "unversioned release", changes: { version: "dev" }, stage: "manifest" },
    {
      name: "invalid source fingerprint",
      changes: { source_tree_sha256: "invalid" },
      stage: "manifest",
    },
    { name: "partial source provenance", changes: { source_dirty: undefined }, stage: "manifest" },
  ])("rejects $name before staging", ({ changes, stage }) =>
    Effect.gen(function* () {
      const f = yield* fixture();
      yield* f.writeManifest(changes);
      const failure = yield* loadCoreArtifact({
        manifestPath: f.manifestPath,
        platform: "mac",
        arch: "arm64",
      }).pipe(Effect.flip);
      assert.equal(failure.stage, stage);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects an incorrectly labelled executable even when its hash matches", () =>
    Effect.gen(function* () {
      const f = yield* fixture();
      f.bytes.writeUInt32LE(0x1000007, 4);
      yield* f.fs.writeFile(f.path.join(f.root, f.manifest.binary), f.bytes);
      yield* f.writeManifest({
        sha256: NodeCrypto.createHash("sha256").update(f.bytes).digest("hex"),
      });
      const failure = yield* loadCoreArtifact({
        manifestPath: f.manifestPath,
        platform: "mac",
        arch: "arm64",
      }).pipe(Effect.flip);
      assert.equal(failure.stage, "format");
    }).pipe(Effect.scoped),
  );

  it.effect("requires a Core manifest for a desktop distribution", () =>
    Effect.gen(function* () {
      const failure = yield* loadCoreArtifact({
        manifestPath: undefined,
        platform: "mac",
        arch: "arm64",
      }).pipe(Effect.flip);
      assert.equal(failure.stage, "manifest");
    }),
  );
  it.effect.each(["mac", "linux", "win"] as const)(
    "verifies the final packaged %s payload and rejects changes after staging",
    (platform) =>
      Effect.gen(function* () {
        const f = yield* fixture(platform);
        const artifact = yield* loadCoreArtifact({
          manifestPath: f.manifestPath,
          platform,
          arch: "arm64",
        });
        const distribution = f.path.join(f.root, "distribution");
        const destination =
          platform === "mac"
            ? f.path.join(
                distribution,
                "mac-arm64",
                "Generated.app",
                "Contents",
                "Resources",
                "agentshare-core",
              )
            : f.path.join(distribution, `${platform}-unpacked`, "resources", "agentshare-core");
        yield* stageCoreArtifact(artifact, destination);
        const input = {
          distribution,
          platform,
          arch: "arm64" as const,
          expected: artifact.manifest,
        };
        yield* verifyPackagedCore(input);
        const stagedManifest = f.path.join(destination, "manifest.json");
        const originalManifest = yield* f.fs.readFileString(stagedManifest);
        yield* f.fs.writeFileString(
          stagedManifest,
          JSON.stringify({ ...JSON.parse(originalManifest), source_tree_sha256: "b".repeat(64) }),
        );
        const provenanceFailure = yield* verifyPackagedCore(input).pipe(Effect.flip);
        assert.equal(provenanceFailure.stage, "hash");
        yield* f.fs.writeFileString(stagedManifest, originalManifest);
        const binary = platform === "win" ? "agentshare-core.exe" : "agentshare-core";
        const changed = Uint8Array.from(f.bytes);
        changed[changed.length - 1] = 1;
        yield* f.fs.writeFile(f.path.join(destination, binary), changed);
        const failure = yield* verifyPackagedCore(input).pipe(Effect.flip);
        assert.equal(failure.stage, "hash");
      }).pipe(Effect.scoped),
  );
});
