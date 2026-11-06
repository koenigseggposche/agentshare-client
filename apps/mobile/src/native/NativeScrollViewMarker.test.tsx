import { act, type ReactNode, isValidElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";

vi.mock("expo", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeView: () => null,
}));
vi.mock("react-native", () => ({
  Platform: { OS: "ios", Version: 27 },
  ScrollView: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("react-native-screens", () => ({
  ScrollViewMarker: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import { renderNativeScrollView } from "./NativeScrollViewMarker";

it("lets a class list invoke its scroll renderer before React mounts the native scroll component", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const element = renderNativeScrollView({ children: <span>Changed file content</span> });
  expect(isValidElement(element)).toBe(true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    act(() => root.render(element));
    expect(container.textContent).toBe("Changed file content");
  } finally {
    act(() => root.unmount());
  }
});
