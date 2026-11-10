// @effect-diagnostics nodeBuiltinImport:off globalConsole:off
// Launches a packaged desktop app against a seeded T3 home, opens a thread, and checks its
// messages render. Release jobs run it so a build whose backend or bundle cannot start fails
// before it is published.
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeUtil from "node:util";
import { _electron, type ElectronApplication } from "playwright-core";

// A snapshot from an older build on purpose: the packaged server must migrate it forward, as it
// does for every upgrading user. It holds one project and two threads, nothing else.
const FIXTURE_DB = NodePath.join(import.meta.dirname, "fixtures/desktop-launch/statev2.sqlite");
const THREAD_TITLE = "Release launch check";
const THREAD_MESSAGE = "The release opens and shows this thread.";
const STEP_TIMEOUT_MS = 60_000;

const { values } = NodeUtil.parseArgs({
  options: {
    executable: { type: "string" },
    "artifacts-dir": { type: "string" },
  },
});
const executable = values.executable;
if (!executable)
  throw new Error("Usage: smoke-desktop-app.ts --executable <app> [--artifacts-dir <dir>]");
const artifactsDir = NodePath.resolve(values["artifacts-dir"] ?? "desktop-launch-check");

const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-desktop-launch-"));
const t3Home = NodePath.join(home, "t3");
const coreHome = NodePath.join(home, "core");
// The isolated Core is signed out. The Workbench opens its offline account's database.
const offlineAccountKey = NodeCrypto.createHash("sha256").update("offline").digest("hex");
const stateDir = NodePath.join(t3Home, "accounts", offlineAccountKey, "userdata");
NodeFS.mkdirSync(stateDir, { recursive: true });
NodeFS.copyFileSync(FIXTURE_DB, NodePath.join(stateDir, "statev2.sqlite"));

let step = "launching the app";
let app: ElectronApplication | undefined;
try {
  app = await _electron.launch({
    executablePath: executable,
    // Linux CI runners do not allow the Chromium sandbox's user namespaces.
    args: ["--no-sandbox"],
    // HOME stays real: on macOS a fake HOME has no login keychain, and safeStorage blocks the
    // main process on a keychain dialog. macOS keeps its Electron profile in the runner's HOME.
    env: {
      ...process.env,
      XDG_CONFIG_HOME: NodePath.join(home, ".config"),
      XDG_DATA_HOME: NodePath.join(home, ".local/share"),
      AGENTSHARE_CLIENT_HOME: t3Home,
      AGENTSHARE_HOME: coreHome,
      T3CODE_TELEMETRY_ENABLED: "false",
      T3CODE_DISABLE_AUTO_UPDATE: "true",
    },
    timeout: STEP_TIMEOUT_MS,
  });
  // A backend that never starts leaves no window, or only the "could not start" window, so the
  // thread wait below fails either way and its screenshot shows the startup error.
  step = "waiting for the first window";
  const page = await app.firstWindow({ timeout: STEP_TIMEOUT_MS });
  try {
    step = "waiting for onboarding or the seeded thread";
    const welcome = page.getByRole("dialog", { name: "Set up AgentShare" });
    const thread = page.locator("li[data-thread-item]", { hasText: THREAD_TITLE });
    await welcome.or(thread).first().waitFor({ timeout: STEP_TIMEOUT_MS });
    if (await welcome.isVisible()) {
      step = "dismissing the welcome wizard";
      await welcome.getByRole("button", { name: "Close", exact: true }).click();
      await welcome.waitFor({ state: "hidden", timeout: STEP_TIMEOUT_MS });
    }
    step = `finding "${THREAD_TITLE}" in the sidebar`;
    await thread.waitFor({ timeout: STEP_TIMEOUT_MS });
    step = "opening the thread";
    await thread.click();
    await page.getByText(THREAD_MESSAGE).waitFor({ timeout: STEP_TIMEOUT_MS });
  } catch (error) {
    NodeFS.mkdirSync(artifactsDir, { recursive: true });
    await page
      .screenshot({ path: NodePath.join(artifactsDir, "window.png"), timeout: 10_000 })
      .catch(() => {});
    throw error;
  }
  console.log("Desktop launch check passed: the app opened and showed the seeded thread.");
} catch (error) {
  console.error(`Desktop launch check failed while ${step}.`);
  NodeFS.mkdirSync(artifactsDir, { recursive: true });
  console.error(error instanceof Error ? error.message : error);
  const logs = NodePath.join(t3Home, "userdata/logs");
  if (NodeFS.existsSync(logs)) {
    NodeFS.cpSync(logs, NodePath.join(artifactsDir, "logs"), { recursive: true });
    const serverLog = NodePath.join(logs, "server-child.log");
    if (NodeFS.existsSync(serverLog)) {
      console.error("\nLast backend output (server-child.log):");
      console.error(NodeFS.readFileSync(serverLog, "utf8").split("\n").slice(-20).join("\n"));
    }
  }
  process.exitCode = 1;
} finally {
  if (app) {
    // A hung app never finishes closing; kill it so the job does not wait for its timeout.
    // Playwright drops the process handle once the app closes, so read it first.
    const child = app.process();
    const closed = app.close().catch(() => {});
    await Promise.race([closed, NodeTimersPromises.setTimeout(10_000, undefined, { ref: false })]);
    child.kill("SIGKILL");
  }
  const runtime = ["agentshare-runtime", "agentshare-runtime.exe"]
    .map((name) => NodePath.join(coreHome, "bin", name))
    .find((candidate) => NodeFS.existsSync(candidate));
  if (runtime) {
    try {
      await NodeUtil.promisify(NodeChildProcess.execFile)(
        runtime,
        ["agent-launcher", "core", "stop"],
        {
          env: { ...process.env, AGENTSHARE_HOME: coreHome },
          timeout: 15_000,
        },
      );
    } catch {
      console.error("Desktop launch fixture Core did not stop cleanly.");
      process.exitCode = 1;
    }
  }
  NodeFS.rmSync(home, { recursive: true, force: true, maxRetries: 5 });
}
