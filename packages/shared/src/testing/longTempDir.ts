// @effect-diagnostics nodeBuiltinImport:off - runs once at test setup, outside any Effect runtime.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as HostProcess from "../HostProcess.ts";

// Git and realPath canonicalize Windows 8.3 names and macOS /var symlinks.
if (["win32", "darwin"].includes(HostProcess.Platform.defaultValue())) {
  try {
    const longForm = NodeFS.realpathSync.native(NodeOS.tmpdir());
    process.env.TEMP = longForm;
    process.env.TMP = longForm;
    process.env.TMPDIR = longForm;
  } catch {}
}
