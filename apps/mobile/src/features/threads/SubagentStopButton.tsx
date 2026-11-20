import { readUiText } from "../../i18n/uiText";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, OrchestrationV2Subagent } from "@t3tools/contracts";
import { useState } from "react";
import { View } from "react-native";

import * as Dialog from "../../components/ui/Dialog";
import { IconButton } from "../../components/ui/IconButton";
import { orchestrationEnvironment } from "../../state/orchestration";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  resolveSubagentRowPresentation,
  resolveSubagentStopTarget,
} from "./threadAgentsPresentation";

export function SubagentStopButton(props: {
  readonly environmentId: EnvironmentId;
  readonly subagent: OrchestrationV2Subagent;
  readonly className?: string;
}) {
  const target = resolveSubagentStopTarget(props.subagent);
  const canStop = useAtomValue(
    orchestrationEnvironment.stopWorkflow.permissionAtom(props.environmentId),
  );
  const stopWorkflow = useAtomCommand(orchestrationEnvironment.stopWorkflow);
  const interruptTurn = useAtomCommand(threadEnvironment.interruptTurn);
  const [stopping, setStopping] = useState(false);

  if (target === null || !canStop) return null;

  const workflow = target.kind === "workflow";
  const label =
    props.subagent.workflow?.name ?? resolveSubagentRowPresentation(props.subagent).title;
  const stop = async () => {
    setStopping(true);
    const result = await (
      target.kind === "workflow"
        ? stopWorkflow({ environmentId: props.environmentId, input: target.input })
        : interruptTurn({ environmentId: props.environmentId, input: target.input })
    ).finally(() => setStopping(false));
    if (result._tag === "Failure") {
      Dialog.alert(
        workflow ? readUiText("Could not stop workflow") : readUiText("Could not stop agent"),
      );
    }
  };

  return (
    <View className={props.className}>
      <IconButton
        icon="stop.fill"
        variant="danger"
        accessibilityLabel={`${stopping ? "Stopping" : "Stop"} ${workflow ? "workflow" : "agent"} ${label}`}
        disabled={stopping}
        onPress={() =>
          Dialog.confirm({
            title: workflow ? readUiText("Stop workflow?") : readUiText("Stop agent?"),
            message: workflow
              ? readUiText("Every running agent in {0} stops.", [label])
              : readUiText("Stop {0}?", [label]),
            confirmText: readUiText("Stop"),
            destructive: true,
            onConfirm: () => void stop(),
          })
        }
      />
    </View>
  );
}
