export const DEFAULT_COMPOSER_PLACEHOLDER = "Ask anything. @ files, $ skills, / commands";

export const composerPlaceholderLabels = {
  en: {
    default: DEFAULT_COMPOSER_PLACEHOLDER,
    approvalFeedback: "Send feedback to decline this request",
    approvalRedirect: "Send a message to decline and redirect the agent",
    chooseOption: "Choose an option above",
    customAnswer: "Type your own answer, or leave this blank to use the selected option",
    refinePlan: "Add feedback to refine the plan, or leave this blank to implement it",
    chooseProject: "Choose a project above to start a thread",
    enableProvider: "Enable a provider in Settings to send a message",
  },
  zh: {
    default: "输入你的问题。用 @ 引用文件，$ 选择技能，/ 输入命令",
    approvalFeedback: "发送反馈以拒绝此请求",
    approvalRedirect: "发送消息以拒绝此请求，并告诉助手接下来怎么做",
    chooseOption: "从上方选择一个选项",
    customAnswer: "输入你的回答，或留空以使用已选选项",
    refinePlan: "填写反馈以完善计划，或留空以执行计划",
    chooseProject: "在上方选择项目以开始会话",
    enableProvider: "在设置中启用模型服务后即可发送消息",
  },
} as const;
