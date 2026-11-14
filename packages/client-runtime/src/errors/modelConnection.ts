const chineseMessages: Readonly<Record<string, string>> = {
  "Cannot reach Gateway. Check the execution computer's network connection and local network access, then retry.":
    "无法连接 Gateway。请检查执行电脑的网络连接和本地网络访问权限，然后重试。",
  "The selected model connection could not be opened. Check the execution computer and model availability, then retry.":
    "无法打开所选模型连接。请检查执行电脑和模型是否可用，然后重试。",
  "Model connection interrupted": "模型连接中断",
  "Model response interrupted": "模型响应中断",
  "The model connection was interrupted. The request was not retried automatically. Check any partial output or changes before retrying.":
    "模型连接已中断，此请求未自动重试。请先检查已有输出或文件改动，再决定是否重试。",
};

export function localizeModelConnectionMessage(message: string, language: "zh" | "en"): string {
  if (language !== "zh") return message;
  const interruptedPrefix =
    "The task stopped before the model finished responding. Check any partial output or changes before retrying. ";
  if (message.startsWith(interruptedPrefix)) {
    return (
      "模型尚未完成响应，任务已停止。请先检查已有输出或文件改动，再决定是否重试。 " +
      message.slice(interruptedPrefix.length)
    );
  }
  return chineseMessages[message] ?? message;
}
