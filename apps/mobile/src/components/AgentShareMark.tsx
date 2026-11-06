import {
  AGENT_SHARE_MARK_PATH,
  AGENT_SHARE_MARK_TRANSFORM,
} from "@t3tools/client-runtime/agentshare/brand";
import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

export function AgentShareMark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  return (
    <Svg
      accessibilityLabel="AgentShare"
      height={props.height}
      width={props.height}
      viewBox="0 0 64 64"
    >
      <ThemedPath
        d={AGENT_SHARE_MARK_PATH}
        transform={AGENT_SHARE_MARK_TRANSFORM}
        fillRule="evenodd"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="currentColor"
      />
    </Svg>
  );
}
