import { describe, expect, it } from "vite-plus/test";

import {
  renderLinuxStartupEntry,
  renderMacStartupEntry,
  startupArguments,
  startupContextFromArguments,
} from "./DesktopStartupEntries.ts";

describe("client login startup context", () => {
  it.each([
    [
      "linux",
      { workbenchHome: "/home/reader/Work bench", coreHome: "/home/reader/Core", port: 48710 },
    ],
    ["darwin", { workbenchHome: "/Users/reader/工作台", coreHome: "/Users/reader/Core" }],
    ["win32", { workbenchHome: "C:\\Users\\reader\\Work bench", coreHome: "D:\\Core\\" }],
  ] as const)("preserves the exact workbench and Core directories on %s", (platform, context) => {
    expect(startupContextFromArguments(startupArguments(context), platform)).toEqual(context);
  });

  it("rejects incomplete or ambiguous startup instead of selecting another account home", () => {
    expect(startupContextFromArguments(["--agentshare-core-home=/other"], "linux")).toBeUndefined();
    for (const args of [
      ["--agentshare-startup"],
      startupArguments({ workbenchHome: "relative", coreHome: "/core" }),
      startupArguments({ workbenchHome: "/work", coreHome: "/core\nother" }),
      startupArguments({ workbenchHome: "/work", coreHome: "/core", port: 0 }),
      [
        ...startupArguments({ workbenchHome: "/work", coreHome: "/core" }),
        "--agentshare-core-home=/other",
      ],
    ])
      expect(() => startupContextFromArguments(args, "linux")).toThrow();
  });

  it("keeps XML and desktop entry delimiters inside arguments", () => {
    const input = {
      identifier: "app.agentshare.client.startup",
      bundleIdentifier: "app.agentshare.client",
      executable: "/Applications/A & B.app/Contents/MacOS/Client",
      args: startupArguments({ workbenchHome: "/work/<demo>", coreHome: "/core/50% $x" }),
    };
    const mac = renderMacStartupEntry(input);
    expect(mac).toContain("A &amp; B.app");
    expect(mac).toContain("/work/&lt;demo&gt;");
    expect(mac).toContain("<key>RunAtLoad</key><true/>");
    expect(mac).toContain(
      "<key>AssociatedBundleIdentifiers</key><array><string>app.agentshare.client</string></array>",
    );
    expect(() => renderMacStartupEntry({ ...input, bundleIdentifier: "../other" })).toThrow();
    const linux = renderLinuxStartupEntry({ ...input, displayName: "Client\nExec=unwanted" });
    expect(linux.match(/^Exec=/gm)).toHaveLength(1);
    expect(linux).toContain("Name=Client\\nExec=unwanted");
    expect(linux).toContain("50%%");
    expect(() => renderMacStartupEntry({ ...input, identifier: "../other" })).toThrow();
  });
});
