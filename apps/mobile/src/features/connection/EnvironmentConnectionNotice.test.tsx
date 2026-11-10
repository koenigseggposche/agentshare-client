import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentConnectionNotice } from "./EnvironmentConnectionNotice";

const { language } = vi.hoisted(() => ({ language: { value: "zh" as "zh" | "en" } }));

vi.mock("react-native", () => ({
  View: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../../components/ui/Button", () => ({
  Button: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({ AppActivityIndicator: () => null }));
vi.mock("./ConnectionTraceId", () => ({ ConnectionTraceId: () => null }));
vi.mock("../workspace/navigation-tabs", () => ({ useWorkbenchLanguage: () => language.value }));

it.each([
  ["zh", "正在重连 Mini", "连上工作台后会加载文件预览。", "立即重试"],
  ["en", "Reconnecting to Mini", "The preview will load", "Retry now"],
] as const)("shows the reconnect instruction in %s", (locale, title, detail, retry) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  language.value = locale;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() =>
      root.render(
        <EnvironmentConnectionNotice
          environmentLabel="Mini"
          connection={{ phase: "reconnecting", error: null, traceId: null }}
          resourceName="preview"
          onRetry={() => {}}
        />,
      ),
    );
    expect(container.textContent).toContain(title);
    expect(container.textContent).toContain(detail);
    expect(container.querySelector("button")?.textContent).toBe(retry);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
