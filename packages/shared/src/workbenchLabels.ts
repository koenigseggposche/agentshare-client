export const workbenchLabels = {
  en: {
    threads: "Chats",
    pullRequests: "Pull requests",
    usage: "Usage",
    settings: "Settings",
    navigation: "Navigation",
    back: "Back",
    search: "Search",
    searchThreads: "Search threads",
    searchPullRequests: "Search pull requests",
    clearSearch: "Clear search",
    clearThreadSearch: "Clear thread search",
    addProject: "Add project",
    newThread: "New thread",
    newThreadInProject: "New thread in current project: Shift+click",
    noProjects: "No projects yet",
    noThreads: "No threads yet",
    noThreadsInProjects: "No threads in these projects yet",
    noThreadsInProject: (name: string) => `No threads in ${name} yet`,
  },
  zh: {
    threads: "会话",
    pullRequests: "拉取请求",
    usage: "用量",
    settings: "设置",
    navigation: "导航",
    back: "返回",
    search: "搜索",
    searchThreads: "搜索会话",
    searchPullRequests: "搜索拉取请求",
    clearSearch: "清空搜索",
    clearThreadSearch: "清空会话搜索",
    addProject: "添加项目",
    newThread: "新建会话",
    newThreadInProject: "在当前项目新建会话：按住 Shift 点击",
    noProjects: "还没有项目",
    noThreads: "还没有会话",
    noThreadsInProjects: "这些项目还没有会话",
    noThreadsInProject: (name: string) => `${name} 还没有会话`,
  },
} as const;

export const modelSourceOptions = ["all", "community", "owned", "local"] as const;
export type ModelSourceFilter = (typeof modelSourceOptions)[number];

export const modelSourceLabels = {
  en: { all: "All sources", community: "Community", owned: "My devices", local: "This host" },
  zh: { all: "全部来源", community: "社区", owned: "我的设备", local: "本机" },
} as const;
