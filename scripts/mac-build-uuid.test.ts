// @effect-diagnostics nodeBuiltinImport:off - Exercises the binary packaging hook with generated Mach-O fixtures.
import { describe, expect, it } from "vite-plus/test";
import { assignMacBuildUUID } from "./mac-build-uuid.cjs";

function thin(cpu = 0x0100000c) {
  const bytes = Buffer.alloc(80, 0);
  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(cpu, 4);
  bytes.writeUInt32LE(1, 16);
  bytes.writeUInt32LE(24, 20);
  bytes.writeUInt32LE(0x1b, 32);
  bytes.writeUInt32LE(24, 36);
  bytes.fill(7, 40, 56);
  bytes.fill(42, 56);
  return bytes;
}

describe("macOS application build UUID", () => {
  it("changes only LC_UUID, is repeatable, and separates applications and builds", () => {
    const input = thin();
    const output = assignMacBuildUUID(input, "app:a:1:content");
    expect(output.subarray(0, 40)).toEqual(input.subarray(0, 40));
    expect(output.subarray(56)).toEqual(input.subarray(56));
    expect(output.subarray(40, 56)).not.toEqual(input.subarray(40, 56));
    expect(input.subarray(40, 56)).toEqual(Buffer.alloc(16, 7));
    expect(assignMacBuildUUID(output, "app:a:1:content")).toEqual(output);
    expect(assignMacBuildUUID(input, "app:b:1:content")).not.toEqual(output);
    expect(assignMacBuildUUID(input, "app:a:2:content")).not.toEqual(output);
    expect(assignMacBuildUUID(input, "app:a:1:other")).not.toEqual(output);
  });

  it("updates both universal slices with distinct architecture identities", () => {
    const input = Buffer.alloc(208);
    input.writeUInt32BE(0xcafebabe, 0);
    input.writeUInt32BE(2, 4);
    input.writeUInt32BE(48, 16);
    input.writeUInt32BE(80, 20);
    input.writeUInt32BE(128, 36);
    input.writeUInt32BE(80, 40);
    thin().copy(input, 48);
    thin(0x01000007).copy(input, 128);
    const output = assignMacBuildUUID(input, "app:build");
    expect(output.subarray(0, 48)).toEqual(input.subarray(0, 48));
    expect(output.subarray(88, 104)).not.toEqual(output.subarray(168, 184));
    expect(output.subarray(104, 128)).toEqual(input.subarray(104, 128));
  });

  it("refuses truncated, unsupported and malformed binaries without mutating input", () => {
    for (const mutate of [
      (b: Buffer) => b.subarray(0, 20),
      (b: Buffer) => {
        b.writeUInt32LE(0, 0);
        return b;
      },
      (b: Buffer) => {
        b.writeUInt32LE(200, 20);
        return b;
      },
      (b: Buffer) => {
        b.writeUInt32LE(200, 36);
        return b;
      },
      (b: Buffer) => {
        b.writeUInt32LE(0, 32);
        return b;
      },
    ]) {
      const input = mutate(thin());
      const original = Buffer.from(input);
      expect(() => assignMacBuildUUID(input, "app:build")).toThrow();
      expect(input).toEqual(original);
    }
  });
});
