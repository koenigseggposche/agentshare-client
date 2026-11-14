import type { SettingsSearchItem } from "./settingsSearch";

const chineseLabels: Readonly<Record<string, string>> = {
  AgentShare: "AgentShare",
  Settings: "设置",
  Diagnostics: "诊断",
  Projects: "项目",
  General: "通用",
  Appearance: "外观",
  Chat: "对话",
  "Diffs & pull requests": "改动与合并请求",
  Keybindings: "快捷键",
  SnapShots: "截图",
  Providers: "模型连接",
  Threads: "会话",
  Browser: "浏览器",
  Devices: "设备",
  "Scheduled tasks": "计划任务",
  "Source control": "版本控制",
  Worktrees: "工作树",
  Environments: "执行电脑",
  "Sharing & access": "共享与访问",
  Secrets: "密钥",
  Maintenance: "维护",
  Labs: "实验功能",
  About: "关于",
  Archive: "已归档会话",
  "Archived threads": "已归档会话",
  "Open source licenses": "开源许可",
  Agents: "智能体",
  Code: "代码",
  Connections: "连接",
  Search: "搜索",
  "Search settings": "搜索设置",
  "Clear settings search": "清空设置搜索",
  "No settings found": "未找到设置",
  "Settings search results": "设置搜索结果",
  "Settings sections": "设置分类",
  "Settings breadcrumb": "设置导航",
  Theme: "主题",
};

export function settingsLabel(label: string, language: "zh" | "en"): string {
  return language === "zh" ? (chineseLabels[label] ?? label) : label;
}

export function localizedSettingsSearchItems(
  items: ReadonlyArray<SettingsSearchItem>,
  language: "zh" | "en",
): ReadonlyArray<SettingsSearchItem> {
  if (language === "en") return items;
  return items.map((item) => ({
    ...item,
    title: settingsLabel(item.title, language),
    searchTerms: [item.title, ...(item.searchTerms ?? [])],
  }));
}
