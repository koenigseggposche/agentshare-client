import { type UiTranslator, uiTranslators } from "@t3tools/shared/uiMessages";
import { useUiText } from "../i18n/uiText";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  getNewProjectRepository,
  type NewProjectPublishTarget,
} from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";
import { suggestAppAccessForRemote } from "../components/sourceControlAppAccessToast";

function errorMessage(error: unknown, uiText: UiTranslator = uiTranslators.en): string {
  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : uiText("An error occurred.");
}

export function useNewProject() {
  const uiText = useUiText();
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();

  const publishNewRepository = async (input: {
    readonly environmentId: EnvironmentId;
    readonly workspaceRoot: string;
    readonly target: NewProjectPublishTarget;
  }) => {
    const { label } = input.target.definition;
    const result = await publishRepository({
      environmentId: input.environmentId,
      input: {
        cwd: input.workspaceRoot,
        provider: input.target.definition.kind,
        repository: getNewProjectRepository(input.target, input.workspaceRoot),
        visibility: "private",
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: uiText("Could not create the {0} repository", [label]),
            description: uiText("{0} Use Publish Repository in the Git menu to try again.", [
              errorMessage(squashAtomCommandFailure(result), uiText),
            ]),
          }),
        );
      }
      return;
    }
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: uiText("Published to {0}", [label]),
        description: result.value.repository.nameWithOwner,
      }),
    );
    void suggestAppAccessForRemote(input.environmentId, result.value.remoteUrl, uiText);
  };

  return async (input: {
    readonly environmentId: EnvironmentId;
    readonly name: string;
    readonly publishTo: NewProjectPublishTarget | null;
  }): Promise<boolean> => {
    const result = await createNew({
      environmentId: input.environmentId,
      input: { name: input.name },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: uiText("Could not create the project"),
            description: errorMessage(squashAtomCommandFailure(result), uiText),
          }),
        );
      }
      return false;
    }

    const { projectId, workspaceRoot, commitError } = result.value;
    toastManager.add(
      stackedThreadToast(
        commitError === undefined
          ? {
              type: "success",
              title: uiText("Created {0}", [input.name]),
              description: workspaceRoot,
            }
          : {
              type: "warning",
              title: uiText("Created {0} without a first commit", [input.name]),
              description: uiText("{0} The project is in {1}.", [commitError, workspaceRoot]),
            },
      ),
    );
    if (input.publishTo) {
      void publishNewRepository({
        environmentId: input.environmentId,
        workspaceRoot,
        target: input.publishTo,
      });
    }

    const projectRef = scopeProjectRef(input.environmentId, projectId);
    // Wait for the stored project path; drafts use it as their key.
    const project = await waitForProject(projectRef).catch((error: unknown) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: uiText("Failed to open project"),
          description: uiText("{0} It will appear in the sidebar once this client catches up.", [
            errorMessage(error, uiText),
          ]),
        }),
      );
      return null;
    });
    if (project === null) return true;
    await handleNewThread(projectRef).catch((error: unknown) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: uiText("Failed to open project"),
          description: errorMessage(error, uiText),
        }),
      );
    });
    return true;
  };
}
