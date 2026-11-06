import {
  ThreadId,
  type AgentSharePrepareTerminalInput,
  type EnvironmentId,
  type TerminalOpenInput,
  type TerminalWriteInput,
} from "@t3tools/contracts";
import type { AtomCommandResult } from "./state/runtime.ts";

type Request<A> = { readonly environmentId: EnvironmentId; readonly input: A };
interface TerminalLaunchPorts {
  readonly open: (
    request: Request<TerminalOpenInput>,
  ) => Promise<AtomCommandResult<unknown, unknown>>;
  readonly prepare: (
    request: Request<AgentSharePrepareTerminalInput>,
  ) => Promise<AtomCommandResult<{ readonly command: string }, unknown>>;
  readonly write: (
    request: Request<TerminalWriteInput>,
  ) => Promise<AtomCommandResult<unknown, unknown>>;
}

export function managedTerminalThreadId(owner: string): ThreadId {
  return ThreadId.make(`as-cli-${encodeURIComponent(owner)}`);
}

/** A launch is explicit and single-use. Reattaching must never submit a command. */
export function createManagedTerminalLauncher(ports: TerminalLaunchPorts) {
  const submitted = new Set<string>();
  return async (
    request: Request<AgentSharePrepareTerminalInput>,
  ): Promise<"submitted" | "open-unconfirmed" | "unconfirmed" | "already-submitted"> => {
    const { environmentId, input } = request;
    const key = JSON.stringify([environmentId, input.threadId, input.terminalId]);
    if (submitted.has(key)) return "already-submitted";
    submitted.add(key);
    let terminalOpened = false;
    try {
      const opened = await ports.open({
        environmentId,
        input: { threadId: input.threadId, terminalId: input.terminalId, cwd: input.directory },
      });
      if (opened._tag !== "Success") return "open-unconfirmed";
      terminalOpened = true;
      const prepared = await ports.prepare(request);
      if (prepared._tag !== "Success") return "unconfirmed";
      const written = await ports.write({
        environmentId,
        input: {
          threadId: input.threadId,
          terminalId: input.terminalId,
          data: `${prepared.value.command}\r`,
        },
      });
      return written._tag === "Success" ? "submitted" : "unconfirmed";
    } catch {
      return terminalOpened ? "unconfirmed" : "open-unconfirmed";
    }
  };
}
