import { describe, expect, it } from "vite-plus/test";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import { EnvironmentId, type AgentSharePrepareTerminalInput } from "@t3tools/contracts";
import { createManagedTerminalLauncher, managedTerminalThreadId } from "./agentShareTerminal.ts";

const request = {
  environmentId: EnvironmentId.make("host-one"),
  input: {
    owner: "user-one",
    model: { id: "generated-model", source: "community", service: "codex", runtime: "codex" },
    directory: "/tmp/generated",
    threadId: managedTerminalThreadId("user-one"),
    terminalId: "cli-one",
  } satisfies AgentSharePrepareTerminalInput,
};
const failed = <A = unknown>() => AsyncResult.failure<A, string>(Cause.fail("offline"));
describe("managed CLI launch", () => {
  it("opens before preparation and submits exactly once even for concurrent calls", async () => {
    const calls: unknown[] = [];
    const launch = createManagedTerminalLauncher({
      open: async (value) => {
        calls.push(["open", value]);
        return AsyncResult.success(undefined);
      },
      prepare: async (value) => {
        calls.push(["prepare", value]);
        return AsyncResult.success({ command: "generated-command" });
      },
      write: async (value) => {
        calls.push(["write", value]);
        return AsyncResult.success(undefined);
      },
    });
    expect(await Promise.all([launch(request), launch(request)])).toEqual([
      "submitted",
      "already-submitted",
    ]);
    expect(calls).toEqual([
      [
        "open",
        {
          environmentId: request.environmentId,
          input: { threadId: request.input.threadId, terminalId: "cli-one", cwd: "/tmp/generated" },
        },
      ],
      ["prepare", request],
      [
        "write",
        {
          environmentId: request.environmentId,
          input: {
            threadId: request.input.threadId,
            terminalId: "cli-one",
            data: "generated-command\r",
          },
        },
      ],
    ]);
  });
  it.each(["open", "prepare", "write", "throw"])(
    "does not retry an uncertain %s result",
    async (stage) => {
      const calls: string[] = [];
      const launch = createManagedTerminalLauncher({
        open: async () => {
          calls.push("open");
          if (stage === "throw") throw new Error("offline");
          return stage === "open" ? failed() : AsyncResult.success(undefined);
        },
        prepare: async () => {
          calls.push("prepare");
          return stage === "prepare"
            ? failed()
            : AsyncResult.success({ command: "generated-command" });
        },
        write: async () => {
          calls.push("write");
          return stage === "write" ? failed() : AsyncResult.success(undefined);
        },
      });
      expect(await launch(request)).toBe(
        stage === "open" || stage === "throw" ? "open-unconfirmed" : "unconfirmed",
      );
      const snapshot = [...calls];
      expect(await launch(request)).toBe("already-submitted");
      expect(calls).toEqual(snapshot);
      expect(calls).toEqual(
        stage === "open" || stage === "throw"
          ? ["open"]
          : stage === "prepare"
            ? ["open", "prepare"]
            : ["open", "prepare", "write"],
      );
    },
  );
  it("isolates terminal groups by owner, including ambiguous separators", () => {
    expect(managedTerminalThreadId("a/b")).not.toBe(managedTerminalThreadId("a%2Fb"));
    expect(managedTerminalThreadId("user-one")).not.toBe(managedTerminalThreadId("user-two"));
  });
});
