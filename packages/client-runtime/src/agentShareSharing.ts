import type { AgentShareDeviceStatus } from "@t3tools/contracts";

export function sharingSourceState(source: AgentShareDeviceStatus["sources"][number]) {
  if (source.draining) return "draining";
  if (source.connected) return source.accepting ? "sharing" : "paused";
  if (source.error) return "needs-attention";
  if (source.provider_id) return "connecting";
  return source.ready ? "ready" : "login-required";
}

export const sharingCapacityOptions = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function sharingSourceLabel(
  source: AgentShareDeviceStatus["sources"][number],
  language: "zh" | "en",
) {
  const labels = {
    draining: ["正在完成已接受的请求", "Finishing accepted requests"],
    sharing: ["正在分享", "Sharing"],
    paused: ["已暂停", "Paused"],
    connecting: ["正在连接共享服务", "Connecting the sharing service"],
    ready: ["可以开始分享", "Ready to share"],
    "needs-attention": [
      "请检查来源状态或完成官方登录",
      "Check the source or complete native sign-in",
    ],
    "login-required": ["需要在执行电脑登录或准备模型", "Sign in or prepare the model on the host"],
  } as const;
  return labels[sharingSourceState(source)][language === "zh" ? 0 : 1];
}
