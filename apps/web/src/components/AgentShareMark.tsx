import {
  AGENT_SHARE_MARK_PATH,
  AGENT_SHARE_MARK_TRANSFORM,
} from "@t3tools/client-runtime/agentshare/brand";
import type { SVGProps } from "react";

export function AgentShareMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <path
        d={AGENT_SHARE_MARK_PATH}
        transform={AGENT_SHARE_MARK_TRANSFORM}
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
