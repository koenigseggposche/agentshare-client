// @effect-diagnostics nodeBuiltinImport:off - Release staging hashes the exact bytes shipped to each desktop platform.
import * as NodeBuffer from "node:buffer";
import * as NodeCrypto from "node:crypto";
import { parseSemver } from "@t3tools/shared/semver";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

const Manifest = Schema.Struct({
  schema: Schema.Literal(1),
  api_version: Schema.Literal(1),
  version: Schema.NonEmptyString,
  revision: Schema.NonEmptyString,
  platform: Schema.Literals(["darwin", "linux", "win32"]),
  arch: Schema.Literals(["arm64", "x64", "universal"]),
  binary: Schema.String,
  size: Schema.Int,
  sha256: Schema.String,
  source_dirty: Schema.optional(Schema.Boolean),
  source_tree_sha256: Schema.optional(Schema.String),
});
const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest));
const encodeManifest = Schema.encodeEffect(Schema.fromJsonString(Manifest));

class CoreArtifactError extends Schema.TaggedError<CoreArtifactError>()("CoreArtifactError", {
  stage: Schema.Literals(["manifest", "target", "size", "hash", "format", "staging"]),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message() {
    return `AgentShare Core artifact verification failed (${this.stage}). Supply --core-manifest for this client target.`;
  }
}

const isArtifactError = Schema.is(CoreArtifactError);

const matchesTarget = (bytes: Uint8Array, platform: string, arch: string): boolean => {
  const b = NodeBuffer.Buffer.from(bytes);
  if (b.length < 64) return false;
  if (platform === "darwin") {
    if (arch === "universal") {
      if (b.readUInt32BE(0) !== 0xcafebabe || b.readUInt32BE(4) !== 2) return false;
      const cpus = [b.readUInt32BE(8), b.readUInt32BE(28)].sort((a, z) => a - z);
      return cpus[0] === 0x1000007 && cpus[1] === 0x100000c;
    }
    return (
      b.readUInt32LE(0) === 0xfeedfacf &&
      b.readUInt32LE(4) === (arch === "arm64" ? 0x100000c : 0x1000007)
    );
  }
  if (platform === "linux") {
    return (
      b.subarray(0, 6).equals(NodeBuffer.Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])) &&
      b.readUInt16LE(18) === (arch === "arm64" ? 183 : 62)
    );
  }
  const peOffset = b.readUInt32LE(0x3c);
  return (
    b[0] === 0x4d &&
    b[1] === 0x5a &&
    peOffset <= b.length - 6 &&
    b.readUInt32LE(peOffset) === 0x4550 &&
    b.readUInt16LE(peOffset + 4) === (arch === "arm64" ? 0xaa64 : 0x8664)
  );
};

export const loadCoreArtifact = Effect.fn("desktop.coreArtifact.load")(function* (input: {
  readonly manifestPath: string | undefined;
  readonly platform: "mac" | "linux" | "win";
  readonly arch: "arm64" | "x64" | "universal";
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!input.manifestPath) return yield* new CoreArtifactError({ stage: "manifest" });
  const manifest = yield* fs.readFileString(input.manifestPath).pipe(
    Effect.flatMap(decodeManifest),
    Effect.mapError((cause) => new CoreArtifactError({ stage: "manifest", cause })),
  );
  const platform =
    input.platform === "mac" ? "darwin" : input.platform === "win" ? "win32" : "linux";
  if (
    manifest.platform !== platform ||
    manifest.arch !== input.arch ||
    (platform !== "darwin" && manifest.arch === "universal")
  ) {
    return yield* new CoreArtifactError({ stage: "target" });
  }
  if (
    !parseSemver(manifest.version) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(manifest.binary) ||
    manifest.binary === "." ||
    manifest.binary === ".." ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    (manifest.source_dirty === undefined) !== (manifest.source_tree_sha256 === undefined) ||
    (manifest.source_tree_sha256 !== undefined &&
      !/^[a-f0-9]{64}$/.test(manifest.source_tree_sha256))
  ) {
    return yield* new CoreArtifactError({ stage: "manifest" });
  }
  const binaryPath = path.join(path.dirname(input.manifestPath), manifest.binary);
  const stat = yield* fs
    .stat(binaryPath)
    .pipe(Effect.mapError((cause) => new CoreArtifactError({ stage: "size", cause })));
  if (
    stat.type !== "File" ||
    manifest.size < 64 ||
    manifest.size > 256 * 1024 * 1024 ||
    Number(stat.size) !== manifest.size
  ) {
    return yield* new CoreArtifactError({ stage: "size" });
  }
  const bytes = yield* fs
    .readFile(binaryPath)
    .pipe(Effect.mapError((cause) => new CoreArtifactError({ stage: "hash", cause })));
  if (
    bytes.length !== manifest.size ||
    NodeCrypto.createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
  ) {
    return yield* new CoreArtifactError({ stage: "hash" });
  }
  if (!matchesTarget(bytes, platform, input.arch))
    return yield* new CoreArtifactError({ stage: "format" });
  return { manifest, bytes };
});

export const stageCoreArtifact = Effect.fn("desktop.coreArtifact.stage")(
  function* (artifact: Effect.Success<ReturnType<typeof loadCoreArtifact>>, destination: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const binary =
      artifact.manifest.platform === "win32" ? "agentshare-core.exe" : "agentshare-core";
    const executable = path.join(destination, binary);
    yield* fs.makeDirectory(destination, { recursive: true });
    yield* fs.writeFile(executable, artifact.bytes);
    yield* fs.chmod(executable, 0o755);
    const staged = yield* fs.readFile(executable);
    if (NodeCrypto.createHash("sha256").update(staged).digest("hex") !== artifact.manifest.sha256) {
      return yield* new CoreArtifactError({ stage: "hash" });
    }
    yield* fs.writeFileString(
      path.join(destination, "manifest.json"),
      yield* encodeManifest({ ...artifact.manifest, binary }),
    );
  },
  Effect.mapError((cause) =>
    isArtifactError(cause) ? cause : new CoreArtifactError({ stage: "staging", cause }),
  ),
);

export const verifyPackagedCore = Effect.fn("desktop.coreArtifact.verifyPackaged")(
  function* (input: {
    readonly distribution: string;
    readonly platform: "mac" | "linux" | "win";
    readonly arch: "arm64" | "x64" | "universal";
    readonly expected: Effect.Success<ReturnType<typeof loadCoreArtifact>>["manifest"];
  }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const candidates: string[] = [];
    for (const entry of yield* fs.readDirectory(input.distribution)) {
      const directory = path.join(input.distribution, entry);
      if ((yield* fs.stat(directory)).type !== "Directory") continue;
      if (input.platform === "mac") {
        if (entry.endsWith(".app"))
          candidates.push(path.join(directory, "Contents/Resources/agentshare-core/manifest.json"));
        else {
          for (const app of yield* fs.readDirectory(directory)) {
            if (app.endsWith(".app"))
              candidates.push(
                path.join(directory, app, "Contents/Resources/agentshare-core/manifest.json"),
              );
          }
        }
      } else if (entry.endsWith("-unpacked")) {
        candidates.push(path.join(directory, "resources/agentshare-core/manifest.json"));
      }
    }
    if (candidates.length === 0) return yield* new CoreArtifactError({ stage: "staging" });
    for (const manifestPath of candidates) {
      const artifact = yield* loadCoreArtifact({
        manifestPath,
        platform: input.platform,
        arch: input.arch,
      });
      if (
        artifact.manifest.sha256 !== input.expected.sha256 ||
        artifact.manifest.version !== input.expected.version ||
        artifact.manifest.revision !== input.expected.revision ||
        artifact.manifest.source_dirty !== input.expected.source_dirty ||
        artifact.manifest.source_tree_sha256 !== input.expected.source_tree_sha256
      ) {
        return yield* new CoreArtifactError({ stage: "hash" });
      }
    }
  },
  Effect.mapError((cause) =>
    isArtifactError(cause) ? cause : new CoreArtifactError({ stage: "staging", cause }),
  ),
);
