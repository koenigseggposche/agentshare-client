import {
  connectionStatusText,
  type EnvironmentConnectionPresentation,
} from "@t3tools/client-runtime/connection";

export function environmentStatusText(
  connection: EnvironmentConnectionPresentation,
  language: "zh" | "en" = "en",
): string {
  if (connection.phase === "unsupported" && connection.error !== null) return connection.error;
  if (language === "en") return connectionStatusText(connection);

  switch (connection.phase) {
    case "available":
      return "可用";
    case "offline":
      return "离线";
    case "connecting":
      return "正在连接…";
    case "reconnecting":
      return connection.error ? `连接失败，正在重连… 原因：${connection.error}` : "正在重连…";
    case "connected":
      return "已连接";
    case "unsupported":
      return "客户端版本不受支持";
    case "error":
      return connection.error ? `连接失败。原因：${connection.error}` : "连接失败";
  }
}
