import { escapeDesktopEntryExecArgument } from "./DesktopLinuxUrlHandler.ts";

export interface StartupContext {
  readonly workbenchHome: string;
  readonly coreHome: string;
  readonly port?: number;
}

const STARTUP_SWITCH = "--agentshare-startup";
const WORKBENCH_SWITCH = "--agentshare-workbench-home=";
const CORE_SWITCH = "--agentshare-core-home=";
const PORT_SWITCH = "--agentshare-startup-port=";

export function startupArguments(context: StartupContext): string[] {
  return [
    STARTUP_SWITCH,
    WORKBENCH_SWITCH + context.workbenchHome,
    CORE_SWITCH + context.coreHome,
    ...(context.port === undefined ? [] : [PORT_SWITCH + context.port]),
  ];
}

export function startupContextFromArguments(
  args: readonly string[],
  platform: NodeJS.Platform,
): StartupContext | undefined {
  if (!args.includes(STARTUP_SWITCH)) return undefined;
  const read = (prefix: string, required: boolean) => {
    const values = args.filter((arg) => arg.startsWith(prefix));
    if (values.length > 1 || (required && values.length !== 1))
      throw new Error("Invalid client startup context.");
    return values[0]?.slice(prefix.length);
  };
  const absolutePath = (value: string | undefined): string => {
    if (
      !value ||
      /[\0\r\n]/.test(value) ||
      !(platform === "win32"
        ? /^(?:[A-Za-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value)
        : value.startsWith("/"))
    )
      throw new Error("Client startup requires absolute data directories.");
    return value;
  };
  const workbenchHome = absolutePath(read(WORKBENCH_SWITCH, true));
  const coreHome = absolutePath(read(CORE_SWITCH, true));
  const portValue = read(PORT_SWITCH, false);
  const port = portValue === undefined ? undefined : Number(portValue);
  if (port !== undefined && (!/^\d+$/.test(portValue!) || port < 1 || port > 65_535))
    throw new Error("Invalid client startup port.");
  return { workbenchHome, coreHome, ...(port === undefined ? {} : { port }) };
}

const xml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function startupEntryMarker(identifier: string): string {
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,180}$/.test(identifier))
    throw new Error("Invalid client startup identifier.");
  return `AgentShare Client startup: ${identifier}`;
}

export function renderMacStartupEntry(input: {
  readonly identifier: string;
  readonly bundleIdentifier: string;
  readonly executable: string;
  readonly args: readonly string[];
}): string {
  if (!/^[A-Za-z][A-Za-z0-9.-]{0,180}$/.test(input.bundleIdentifier))
    throw new Error("Invalid client bundle identifier.");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    `<!-- ${startupEntryMarker(input.identifier)} -->`,
    '<plist version="1.0"><dict>',
    `<key>Label</key><string>${xml(input.identifier)}</string>`,
    `<key>AssociatedBundleIdentifiers</key><array><string>${xml(input.bundleIdentifier)}</string></array>`,
    "<key>ProgramArguments</key><array>",
    ...[input.executable, ...input.args].map((arg) => `<string>${xml(arg)}</string>`),
    "</array>",
    "<key>RunAtLoad</key><true/>",
    "<key>LimitLoadToSessionType</key><string>Aqua</string>",
    "</dict></plist>",
    "",
  ].join("\n");
}

export function renderLinuxStartupEntry(input: {
  readonly identifier: string;
  readonly displayName: string;
  readonly executable: string;
  readonly args: readonly string[];
}): string {
  return [
    `# ${startupEntryMarker(input.identifier)}`,
    "[Desktop Entry]",
    "Type=Application",
    `Name=${input.displayName.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\r", "\\r")}`,
    `Exec=${[input.executable, ...input.args].map(escapeDesktopEntryExecArgument).join(" ")}`,
    "Terminal=false",
    "StartupNotify=false",
    "X-GNOME-Autostart-enabled=true",
    "",
  ].join("\n");
}
