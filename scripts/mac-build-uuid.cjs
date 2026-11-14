const { createHash } = require("node:crypto");

// Electron's prebuilt launcher retains its upstream UUID across downstream apps.
// macOS local-network privacy uses the main executable UUID as part of identity.
// Run this only before signing; the final signature must cover the changed bytes.
function assignMacBuildUUID(input, identity) {
  if (!identity || input.length < 32) throw new Error("Missing macOS build identity or executable");
  const output = Buffer.from(input);
  const slices = [];
  const magic = input.readUInt32BE(0);
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    const count = input.readUInt32BE(4);
    const stride = magic === 0xcafebabf ? 32 : 20;
    if (!count || count > 16 || 8 + count * stride > input.length)
      throw new Error("Invalid universal Mach-O header");
    for (let i = 0; i < count; i++) {
      const entry = 8 + i * stride;
      const offset =
        stride === 32 ? Number(input.readBigUInt64BE(entry + 8)) : input.readUInt32BE(entry + 8);
      const size =
        stride === 32 ? Number(input.readBigUInt64BE(entry + 16)) : input.readUInt32BE(entry + 12);
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(size) ||
        offset < 8 + count * stride ||
        size < 32 ||
        offset + size > input.length
      )
        throw new Error("Invalid universal Mach-O slice");
      if (
        slices.some((slice) => offset < slice.offset + slice.size && slice.offset < offset + size)
      )
        throw new Error("Overlapping universal Mach-O slices");
      slices.push({ offset, size });
    }
  } else slices.push({ offset: 0, size: input.length });

  for (const { offset, size } of slices) {
    if (input.readUInt32LE(offset) !== 0xfeedfacf)
      throw new Error("Expected a 64-bit Mach-O executable");
    const count = input.readUInt32LE(offset + 16);
    const commandEnd = offset + 32 + input.readUInt32LE(offset + 20);
    if (commandEnd > offset + size || count > (commandEnd - offset - 32) / 8)
      throw new Error("Invalid Mach-O load commands");
    let cursor = offset + 32;
    let uuidOffset = null;
    for (let i = 0; i < count; i++) {
      if (cursor + 8 > commandEnd) throw new Error("Truncated Mach-O load command");
      const command = input.readUInt32LE(cursor);
      const length = input.readUInt32LE(cursor + 4);
      if (length < 8 || cursor + length > commandEnd)
        throw new Error("Invalid Mach-O load command size");
      if (command === 0x1b) {
        if (length !== 24 || uuidOffset !== null)
          throw new Error("Invalid or duplicate Mach-O UUID");
        uuidOffset = cursor + 8;
      }
      cursor += length;
    }
    if (cursor !== commandEnd || uuidOffset === null) throw new Error("Missing Mach-O UUID");
    const uuid = createHash("sha256")
      .update("macOS application build UUID\0")
      .update(identity)
      .update(input.subarray(offset + 4, offset + 12))
      .digest()
      .subarray(0, 16);
    uuid[6] = (uuid[6] & 0x0f) | 0x50;
    uuid[8] = (uuid[8] & 0x3f) | 0x80;
    uuid.copy(output, uuidOffset);
  }
  return output;
}
module.exports = { assignMacBuildUUID };
