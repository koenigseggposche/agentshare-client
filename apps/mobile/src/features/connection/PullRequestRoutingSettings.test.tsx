import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { PullRequestRoutingSettings } from "./PullRequestRoutingSettings";

const harness = vi.hoisted(() => ({
  entries: new Map<string, { target: { environmentId: string; label: string } }>(),
  permissions: new Map<string, string>(),
  catalogAtom: {},
}));

vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: object) =>
    atom === harness.catalogAtom
      ? { entries: harness.entries, isReady: true }
      : harness.permissions,
}));
vi.mock("../../connection/catalog", () => ({
  environmentCatalog: { catalogValueAtom: harness.catalogAtom },
}));
vi.mock("@t3tools/client-runtime/connection", () => ({
  connectionCatalogDisplayUrl: () => "http://fixture.test/",
  pullRequestRoutingConnectionKey: () => "fixture",
  pullRequestRoutingPermissionFor: (entry: { target: { environmentId: string } }) =>
    harness.permissions.get(entry.target.environmentId) ?? "off",
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Pressable: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/ListChoiceRow", () => ({ ListChoiceRow: () => null }));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/Dialog", () => ({ alert: vi.fn() }));
vi.mock("../settings/components/SettingsSection", () => ({
  SettingsSection: ({ children, title }: { children?: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  ),
}));
vi.mock("../workspace/navigation-tabs", () => ({ useWorkbenchLanguage: () => "zh" }));

it.each([
  { hosts: ["mini"], granted: false, visible: false },
  { hosts: ["mini"], granted: true, visible: true },
  { hosts: ["mini", "peer"], granted: false, visible: true },
])(
  "shows routing only with a peer or a saved permission ($hosts, $granted)",
  ({ hosts, granted, visible }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    harness.entries = new Map(
      hosts.map((host) => [host, { target: { environmentId: host, label: host } }]),
    );
    harness.permissions = new Map(granted ? [["mini", "read"]] : []);
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => root.render(<PullRequestRoutingSettings />));
      expect(container.querySelector('[aria-label="跨工作台 PR 路由"]') !== null).toBe(visible);
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  },
);
