import * as CoreClient from "@agentshare/core-client/CoreClient";
import {
  MessageId,
  TurnItemId,
  ProviderDriverKind,
  ProviderThreadId,
  ProviderTurnId,
  type AgentShareModel,
  type ProviderInstanceId,
  type OrchestrationV2ProviderCapabilities,
  type OrchestrationV2ProviderThread,
  type OrchestrationV2ProviderTurn,
  type OrchestrationV2ExecutionNode,
} from "@t3tools/contracts";
import * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderHost from "@t3tools/provider-core/server/ProviderHost";
import { turnScopedSelectionTransition } from "@t3tools/provider-core/server/selectionTransition";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import * as LocalTextModel from "./LocalTextModel.ts";
import * as LocalTextHistory from "./LocalTextHistory.ts";

export const DRIVER = ProviderDriverKind.make("agentshareText");

const capabilities: OrchestrationV2ProviderCapabilities = {
  sessions: {
    supportsMultipleProviderThreadsPerSession: false,
    supportsModelSwitchInSession: false,
    supportsProviderSwitchingViaHandoff: false,
    supportsRuntimeModeSwitchInSession: true,
    pendingRequestsSurviveRestart: false,
  },
  threads: {
    canCreateEmptyThread: true,
    canReadThreadSnapshot: false,
    canRollbackThread: false,
    canForkThread: false,
    canForkFromTurn: false,
    canForkFromSubagentThread: false,
    exposesNativeThreadId: true,
  },
  turns: {
    exposesNativeTurnId: true,
    emitsTurnStarted: true,
    emitsTurnCompleted: true,
    supportsInterrupt: true,
    supportsActiveSteering: false,
    supportsSteeringByInterruptRestart: false,
    supportsQueuedMessages: true,
    terminalStatusQuality: "strong",
  },
  streaming: {
    streamsAssistantText: false,
    streamsReasoning: false,
    streamsToolOutput: false,
    streamsPlanText: false,
    emitsMessageCompleted: true,
  },
  tools: {
    exposesToolItemIds: false,
    emitsToolStarted: false,
    emitsToolCompleted: false,
    emitsToolOutput: false,
    supportsMcpTools: false,
    supportsDynamicToolCallbacks: false,
  },
  approvals: {
    supportsCommandApproval: false,
    supportsFileReadApproval: false,
    supportsFileChangeApproval: false,
    supportsApplyPatchApproval: false,
    approvalsHaveNativeRequestIds: false,
    approvalCallbacksAreLiveOnly: false,
    approvalsCanOriginateFromSubagents: false,
  },
  planning: {
    emitsPlanUpdated: false,
    emitsTodoList: false,
    emitsProposedPlan: false,
    supportsStructuredQuestions: false,
    planDeltasHaveItemIds: false,
  },
  subagents: {
    supportsSubagents: false,
    exposesSubagentThreadIds: false,
    emitsSubagentLifecycle: false,
    canWaitForSubagents: false,
    canCloseSubagents: false,
    canForkSubagentThread: false,
  },
  context: {
    acceptsSystemContext: false,
    acceptsDeveloperContext: false,
    acceptsSyntheticUserContext: false,
    canGenerateSummaries: false,
    canConsumeHandoffSummaries: false,
    supportsDeltaHandoff: false,
    supportsFullThreadHandoff: false,
    maxRecommendedHandoffChars: null,
  },
  checkpointing: {
    appCanCheckpointFilesystem: false,
    supportsNestedCheckpointScopes: false,
    providerCanRollbackConversation: false,
    providerRollbackReturnsSnapshot: false,
    providerCanReadConversationSnapshot: false,
  },
  identity: {
    nativeThreadIds: "strong",
    nativeTurnIds: "strong",
    nativeItemIds: "none",
    nativeRequestIds: "none",
  },
  runtimePolicy: { enforcement: "client-boundary" },
};

export const make = Effect.fn("AgentShare.LocalTextAdapter.make")(function* (input: {
  readonly instanceId: ProviderInstanceId;
  readonly owner: string;
  readonly model: AgentShareModel;
}) {
  const host = yield* ProviderHost.ProviderHost;
  const path = yield* Path.Path;
  const context = yield* Effect.context<
    CoreClient.CoreClient | FileSystem.FileSystem | Path.Path
  >();
  const directory = path.join(host.paths.stateDir, "local-text", input.instanceId);
  return ProviderAdapter.ProviderAdapterV2.of({
    instanceId: input.instanceId,
    driver: DRIVER,
    getCapabilities: Effect.fn("LocalTextAdapter.getCapabilities")(() =>
      Effect.succeed(capabilities),
    ),
    planSelectionTransition: Effect.fn("LocalTextAdapter.planSelectionTransition")(({ target }) =>
      Effect.succeed(
        target.instanceId === input.instanceId && target.model === input.model.id
          ? turnScopedSelectionTransition()
          : { type: "reject" as const, reason: "Choose this text model in a new conversation." },
      ),
    ),
    openSession: Effect.fn("LocalTextAdapter.openSession")(function* (opening) {
      const scope = yield* Scope.Scope;
      const now = yield* DateTime.now;
      const cwd = opening.runtimePolicy.cwd ?? host.paths.cwd;
      const session = {
        id: opening.providerSessionId,
        driver: DRIVER,
        providerInstanceId: input.instanceId,
        status: "ready" as const,
        cwd,
        model: input.model.id,
        capabilities,
        createdAt: now,
        updatedAt: now,
        lastError: null,
      };
      const history = yield* LocalTextHistory.open({
        ...input,
        model: input.model.id,
        directory,
        thread: opening.threadId,
      }).pipe(
        Effect.provide(context),
        Effect.mapError(
          () =>
            new ProviderAdapter.ProviderAdapterOpenSessionError({
              driver: DRIVER,
              providerSessionId: opening.providerSessionId,
            }),
        ),
      );
      const events = yield* Queue.unbounded<ProviderAdapter.ProviderAdapterV2Event>();
      const starts = yield* Semaphore.make(1);
      let thread: OrchestrationV2ProviderThread = {
        id: ProviderThreadId.make(`text_${opening.threadId}`),
        driver: DRIVER,
        providerInstanceId: input.instanceId,
        providerSessionId: opening.providerSessionId,
        appThreadId: opening.threadId,
        ownerNodeId: null,
        nativeThreadRef: { driver: DRIVER, nativeId: opening.threadId, strength: "strong" },
        nativeConversationHeadRef: null,
        status: "idle",
        firstRunOrdinal: null,
        lastRunOrdinal: null,
        handoffIds: [],
        pendingBackgroundTasks: [],
        contextUsage: null,
        nativeMetadata: null,
        goal: null,
        forkedFrom: null,
        createdAt: now,
        updatedAt: now,
      };
      let active: { readonly turnId: ProviderTurnId; fiber?: Fiber.Fiber<void> } | null = null;
      const publish = (event: ProviderAdapter.ProviderAdapterV2Event) =>
        Queue.offer(events, event).pipe(Effect.asVoid);
      const unsupportedSnapshot = ({
        providerThread,
      }: ProviderAdapter.ProviderAdapterV2ReadThreadSnapshotInput) =>
        Effect.fail(
          new ProviderAdapter.ProviderAdapterReadThreadSnapshotError({
            driver: DRIVER,
            providerThreadId: providerThread.id,
          }),
        );
      return {
        instanceId: input.instanceId,
        driver: DRIVER,
        providerSessionId: opening.providerSessionId,
        providerSession: session,
        events: Stream.fromEffectRepeat(Queue.take(events)),
        backgroundTasksEndWithProcess: true,
        ensureThread: Effect.fn("LocalTextAdapter.ensureThread")(function* (request) {
          if (
            request.threadId !== opening.threadId ||
            request.modelSelection.model !== input.model.id
          )
            return yield* new ProviderAdapter.ProviderAdapterEnsureThreadError({
              driver: DRIVER,
              threadId: request.threadId,
            });
          thread = {
            ...thread,
            ...request.existingProviderThread,
            providerSessionId: session.id,
            updatedAt: yield* DateTime.now,
          };
          yield* publish({
            type: "provider_thread.updated",
            driver: DRIVER,
            providerThread: thread,
          });
          return thread;
        }),
        resumeThread: ({ providerThread }) =>
          Effect.succeed((thread = { ...providerThread, providerSessionId: session.id })),
        startTurn: Effect.fn("LocalTextAdapter.startTurn")(function* (turnInput) {
          const startError = () =>
            new ProviderAdapter.ProviderAdapterTurnStartError({
              driver: DRIVER,
              threadId: turnInput.threadId,
              providerThreadId: thread.id,
              runId: turnInput.runId,
            });
          if (
            active !== null ||
            turnInput.threadId !== opening.threadId ||
            turnInput.modelSelection.instanceId !== input.instanceId ||
            turnInput.modelSelection.model !== input.model.id ||
            turnInput.message.attachments.length !== 0 ||
            turnInput.message.text.trim() === ""
          )
            return yield* startError();
          const current = yield* history
            .read()
            .pipe(Effect.provide(context), Effect.mapError(startError));
          if (
            turnInput.nativeThreadHasTurns &&
            current.messages.length === 0 &&
            current.lastAttempt === null
          )
            return yield* startError();
          const messages = yield* history
            .begin(turnInput.attemptId)
            .pipe(Effect.provide(context), Effect.mapError(startError));
          const startedAt = yield* DateTime.now;
          const turn: OrchestrationV2ProviderTurn = {
            id: ProviderTurnId.make(`text_${turnInput.attemptId}`),
            providerThreadId: thread.id,
            nodeId: turnInput.rootNodeId,
            runAttemptId: turnInput.attemptId,
            nativeTurnRef: { driver: DRIVER, nativeId: turnInput.attemptId, strength: "strong" },
            ordinal: turnInput.providerTurnOrdinal,
            status: "running",
            startedAt,
            completedAt: null,
          };
          const node: OrchestrationV2ExecutionNode = {
            id: turnInput.rootNodeId,
            threadId: turnInput.threadId,
            runId: turnInput.runId,
            rootNodeId: turnInput.rootNodeId,
            parentNodeId: null,
            kind: "root_turn",
            status: "running",
            countsForRun: true,
            providerThreadId: thread.id,
            providerTurnId: turn.id,
            nativeItemRef: null,
            runtimeRequestId: null,
            checkpointScopeId: null,
            startedAt,
            completedAt: null,
          };
          yield* publish({ type: "node.updated", driver: DRIVER, node });
          yield* publish({ type: "provider_turn.updated", driver: DRIVER, providerTurn: turn });
          const tracked = { turnId: turn.id } as {
            readonly turnId: ProviderTurnId;
            fiber?: Fiber.Fiber<void>;
          };
          active = tracked;
          let settled = false;
          const terminal = Effect.fn("LocalTextAdapter.terminal")(function* (
            status: "completed" | "failed" | "interrupted",
          ) {
            if (settled) return;
            settled = true;
            if (active === tracked) active = null;
            const completedAt = yield* DateTime.now;
            yield* publish({
              type: "node.updated",
              driver: DRIVER,
              node: { ...node, status, completedAt },
            });
            yield* publish({
              type: "provider_turn.updated",
              driver: DRIVER,
              providerTurn: { ...turn, status, completedAt },
            });
            if (status === "failed")
              yield* publish({
                type: "turn.terminal",
                driver: DRIVER,
                providerThreadId: thread.id,
                providerTurnId: turn.id,
                runOrdinal: turnInput.runOrdinal,
                failureItemOrdinal: 1,
                status,
                threadDisposition: "reusable",
                failure: {
                  class: "provider_error",
                  message:
                    "The local text request did not complete. Check the model on the execution host.",
                  code: "local_text_request_failed",
                  retryable: false,
                },
              });
            else
              yield* publish({
                type: "turn.terminal",
                driver: DRIVER,
                providerThreadId: thread.id,
                providerTurnId: turn.id,
                runOrdinal: turnInput.runOrdinal,
                status,
                failure: null,
                threadDisposition: "reusable",
              });
          }, Effect.uninterruptible);
          const worker = Effect.gen(function* () {
            const answer = yield* LocalTextModel.complete({
              owner: input.owner,
              model: input.model,
              directory: cwd,
              messages: [...messages, { role: "user", content: turnInput.message.text }],
            });
            yield* Effect.uninterruptible(
              Effect.gen(function* () {
                yield* history.complete(turnInput.attemptId, turnInput.message.text, answer);
                const updatedAt = yield* DateTime.now;
                yield* publish({
                  type: "message.updated",
                  driver: DRIVER,
                  message: {
                    id: MessageId.make(`text_${turnInput.attemptId}`),
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: node.id,
                    role: "assistant",
                    text: answer,
                    attachments: [],
                    streaming: false,
                    createdBy: "agent",
                    creationSource: "provider",
                    createdAt: startedAt,
                    updatedAt,
                  },
                });
                yield* publish({
                  type: "turn_item.updated",
                  driver: DRIVER,
                  turnItem: {
                    id: TurnItemId.make(`text_${turnInput.attemptId}`),
                    type: "assistant_message",
                    threadId: turnInput.threadId,
                    runId: turnInput.runId,
                    nodeId: node.id,
                    providerThreadId: thread.id,
                    providerTurnId: turn.id,
                    nativeItemRef: null,
                    parentItemId: null,
                    ordinal: 1,
                    status: "completed",
                    title: null,
                    startedAt,
                    completedAt: updatedAt,
                    updatedAt,
                    messageId: MessageId.make(`text_${turnInput.attemptId}`),
                    text: answer,
                    streaming: false,
                  },
                });
                yield* terminal("completed");
              }),
            );
          }).pipe(
            Effect.catch(() => terminal("failed")),
            Effect.onInterrupt(() =>
              settled
                ? Effect.void
                : history
                    .interrupt(turnInput.attemptId)
                    .pipe(Effect.ignore, Effect.andThen(terminal("interrupted"))),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                if (active === tracked) active = null;
              }),
            ),
            Effect.provide(context),
          );
          tracked.fiber = yield* worker.pipe(Effect.forkIn(scope));
        }, starts.withPermit),
        steerTurn: (request) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterSteerRunUnsupportedError({
              driver: DRIVER,
              providerThreadId: request.providerThread.id,
            }),
          ),
        interruptTurn: Effect.fn("LocalTextAdapter.interruptTurn")(function* (request) {
          if (active?.turnId === request.providerTurnId && active.fiber)
            yield* Fiber.interrupt(active.fiber);
        }),
        respondToRuntimeRequest: ({ requestId }) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterRuntimeRequestResponseError({
              driver: DRIVER,
              requestId,
            }),
          ),
        readThreadSnapshot: unsupportedSnapshot,
        rollbackThread: ({ providerThread }) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterRollbackThreadError({
              driver: DRIVER,
              providerThreadId: providerThread.id,
            }),
          ),
        forkThread: ({ sourceProviderThread }) =>
          Effect.fail(
            new ProviderAdapter.ProviderAdapterForkThreadError({
              driver: DRIVER,
              providerThreadId: sourceProviderThread.id,
            }),
          ),
      } satisfies ProviderAdapter.ProviderAdapterV2SessionRuntime;
    }),
  });
});
