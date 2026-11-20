import { describe, expect, it } from "vite-plus/test";
import { translateUiLabels, translateUiMessage, uiTranslators } from "./uiMessages.ts";

describe("UI localization boundaries", () => {
  it("interpolates values once without translating or interpreting their contents", () => {
    const content = "Settings /tmp/$&/{1}/项目";
    expect(translateUiMessage("zh", "Open {0}", [content])).toBe(`打开 ${content}`);
    expect(translateUiMessage("en", "Open {0}", [content])).toBe(`Open ${content}`);
    expect(translateUiMessage("zh", "  Settings  ")).toBe("  设置  ");
    expect(translateUiMessage("zh", " · Created ")).toBe(" · 创建于 ");
    expect(translateUiMessage("zh", "constructor")).toBe("constructor");
    expect(translateUiMessage("zh", "Unknown {2}", ["value"])).toBe("Unknown {2}");
  });

  it("localizes authored metadata without changing identifiers, callbacks or icons", () => {
    const action = () => "generated result";
    const icon = { $$typeof: Symbol.for("react.forward_ref"), render: action };
    const options = [{ value: "Settings", label: "Settings", action, icon }];
    const chinese = translateUiLabels(options, uiTranslators.zh);
    expect(chinese[0]).toEqual({ value: "Settings", label: "设置", action, icon });
    expect(chinese[0]?.icon).toBe(icon);
    const taggedRuntimeValue = { [Symbol.for("generated.runtime")]: true, label: "Settings" };
    expect(translateUiLabels(taggedRuntimeValue, uiTranslators.zh)).toBe(taggedRuntimeValue);
    expect(options[0]?.label).toBe("Settings");
    expect(translateUiLabels(options, uiTranslators.zh)).toBe(chinese);
    expect(translateUiLabels(options, uiTranslators.en)[0]?.label).toBe("Settings");
  });
});
