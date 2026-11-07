export const workbenchLabels = {
  en: {
    draftHeading: "What should we work on?",
    noProject: "No project",
    chooseProject: "Choose a project",
    project: "Project",
    searchProjects: "Search projects",
    noMatchingProjects: "No matching projects.",
    projectToStart: " to start",
    addProjectToStart: "Add a project to start",
    orWithoutProject: "or start without a project",
    openProjectPicker: "Opens the project picker",
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
    draftHeading: "今天想做什么？",
    noProject: "未选择项目",
    chooseProject: "选择项目",
    project: "项目",
    searchProjects: "搜索项目",
    noMatchingProjects: "没有匹配的项目。",
    projectToStart: "，开始会话",
    addProjectToStart: "添加项目，开始会话",
    orWithoutProject: "也可以直接开始会话",
    openProjectPicker: "打开项目选择器",
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

export const runtimePermissionLabels = {
  en: {
    heading: "Permissions",
    "approval-required": {
      label: "Supervised",
      description: "Ask before commands and file changes.",
    },
    "auto-accept-edits": {
      label: "Auto-accept edits",
      description: "Auto-approve edits, ask before other actions.",
    },
    auto: {
      label: "Auto",
      description: "Supported providers approve routine actions; others still ask.",
    },
    "full-access": {
      label: "Full access",
      description: "Allow commands and edits without prompts.",
    },
  },
  zh: {
    heading: "权限",
    "approval-required": { label: "修改前询问", description: "运行命令或修改文件前先询问。" },
    "auto-accept-edits": {
      label: "自动批准编辑",
      description: "自动批准文件编辑，其他操作先询问。",
    },
    auto: {
      label: "自动",
      description: "支持自动模式的提供方会批准常规操作，其他提供方仍会询问。",
    },
    "full-access": { label: "完全访问", description: "运行命令和编辑文件时无需逐项确认。" },
  },
} as const;
