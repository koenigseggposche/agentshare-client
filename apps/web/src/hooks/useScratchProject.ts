import { RegistryContext } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { availableScratchWorkspaceRoot } from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";
import { useContext } from "react";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import {
  type EnvironmentPresentation,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentsWithScope } from "~/state/session";
import { type NewThreadHandler, useNewThreadHandler } from "./useHandleNewThread";

function reportScratchFailure(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

type ScratchEnvironment = Pick<EnvironmentPresentation, "connection" | "serverConfig"> & {
  readonly environmentId: EnvironmentId;
};

export function createScratchProjectActions(input: {
  readonly environments: () => Iterable<ScratchEnvironment>;
  readonly primaryEnvironmentId: () => EnvironmentId | null;
  readonly registry: AtomRegistry.AtomRegistry;
  readonly canOperate: (environmentId: EnvironmentId) => boolean;
  readonly handleNewThread: NewThreadHandler;
}) {
  const scratchWorkspaceRootFor = (environmentId: EnvironmentId | null): string | null => {
    let environment: ScratchEnvironment | undefined;
    for (const entry of input.environments()) {
      if (entry.environmentId === environmentId) environment = entry;
    }
    return availableScratchWorkspaceRoot(environment?.connection.phase, environment?.serverConfig);
  };

  // The primary (local) environment wins; `fallback` only applies when it offers no scratch root.
  const scratchEnvironmentId = (fallback: EnvironmentId | null): EnvironmentId | null => {
    const primary = input.primaryEnvironmentId();
    const canStart = (environmentId: EnvironmentId) =>
      input.canOperate(environmentId) && scratchWorkspaceRootFor(environmentId) !== null;
    if (primary !== null && canStart(primary)) return primary;
    if (fallback !== null && canStart(fallback)) return fallback;
    const offering = [...input.environments()].filter((entry) => canStart(entry.environmentId));
    return offering.length === 1 ? (offering[0]?.environmentId ?? null) : null;
  };

  const openScratchProject = async (
    environmentId: EnvironmentId,
    failureTitle = "Could not start without a project",
  ): Promise<EnvironmentProject | null> => {
    if (!input.canOperate(environmentId)) return null;
    const command = projectEnvironment.openScratch;
    const result = await runAtomCommand(
      input.registry,
      command,
      { environmentId, input: {} },
      { label: command.label, reportFailure: false, reportDefect: true },
    );
    if (result._tag === "Success") return result.value;
    if (!isAtomCommandInterrupted(result)) {
      reportScratchFailure(failureTitle, squashAtomCommandFailure(result));
    }
    return null;
  };

  const startScratchThread = async (environmentId: EnvironmentId) => {
    const project = await openScratchProject(environmentId);
    if (project) {
      await input
        .handleNewThread(scopeProjectRef(project.environmentId, project.id))
        .catch((error: unknown) =>
          reportScratchFailure("Could not start without a project", error),
        );
    }
  };

  return { scratchWorkspaceRootFor, scratchEnvironmentId, openScratchProject, startScratchThread };
}

export function useScratchProject() {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const registry = useContext(RegistryContext);
  const handleNewThread = useNewThreadHandler();
  const writable = useEnvironmentsWithScope(environments, AuthOrchestrationOperateScope);
  return {
    ...createScratchProjectActions({
      environments: () => environments,
      primaryEnvironmentId: () => primaryEnvironmentId,
      registry,
      canOperate: (id) => writable.has(id),
      handleNewThread,
    }),
    canCreateProject: environments.some(
      (entry) => entry.connection.phase === "connected" && writable.has(entry.environmentId),
    ),
  };
}
