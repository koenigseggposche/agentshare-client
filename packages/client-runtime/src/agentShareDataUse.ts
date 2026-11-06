export const agentShareDataUse = [
  {
    id: "workbench",
    zh: "会话和工作目录：执行任务的电脑保存会话、项目记录和工具输出。手机和平板连接工作台后，会发送任务输入，并读取获准访问的会话、文件和任务结果。",
    en: "Conversations and workspaces: the execution computer stores conversations, project records, and tool output. Connected phones and tablets send task input and read the conversations, files, and results their connection permits.",
  },
  {
    id: "remote-models",
    zh: "社区与旗舰模型：请求经 Core、Gateway 到达选中的 Provider。提示词、相关上下文和工具结果可能随请求发送；平台保存请求与响应归档、用量和账务记录，用于计费、核对与结算。",
    en: "Community and flagship models: requests travel through Core and Gateway to the selected Provider. Prompts, relevant context, and tool results may be sent with requests. The platform retains request and response archives, usage, and ledger records for billing, reconciliation, and settlement.",
  },
  {
    id: "local-models",
    zh: "本机模型：选择本机来源时，模型在执行电脑上运行。使用其他设备分享的本地模型时，请求仍会通过平台到达那台设备；请先确认所选来源。",
    en: "Local models: a local source runs the model on the execution computer. A local model shared by another device is still reached through the platform; check the selected source before sending.",
  },
  {
    id: "connections",
    zh: "账号与连接：登录信息和工作台连接凭据保存在设备上。远程连接按照授予的权限访问工作台；获得文件或任务权限的连接可以读取相应内容。请在共享与访问设置中查看、限制或撤销连接。",
    en: "Accounts and connections: sign-in information and workbench connection credentials are stored on the device. Remote access follows the granted permissions; connections with file or task access can read that content. Review, restrict, or revoke connections in Sharing & access.",
  },
  {
    id: "tools",
    zh: "工具与外部服务：代理可以按任务授权读取文件、执行命令和调用已配置的服务。代码托管、模型服务与其他工具会按照各自配置和权限处理发送给它们的数据。",
    en: "Tools and external services: agents can read files, run commands, and call configured services as authorized for the task. Code hosts, model services, and other tools process the data sent to them under their own configuration and permissions.",
  },
  {
    id: "diagnostics",
    zh: "诊断：工作台的可选使用统计默认关闭。启用采集需要配置采集目标；也请检查诊断设置中的日志、追踪和指标导出目标。任务计费所需的请求与用量记录独立于可选使用统计。",
    en: "Diagnostics: optional workbench usage analytics are disabled by default and require a configured collection destination. Also review log, trace, and metric export destinations in Diagnostics. Request and usage records needed for task billing are separate from optional usage analytics.",
  },
] as const;
