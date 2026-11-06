import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

const Message = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  content: Schema.String,
});
const Transcript = Schema.Struct({
  owner: Schema.String,
  model: Schema.String,
  messages: Schema.Array(Message),
  attempts: Schema.Array(Schema.String),
  lastAttempt: Schema.NullOr(
    Schema.Struct({
      id: Schema.String,
      status: Schema.Literals(["pending", "completed", "interrupted"]),
    }),
  ),
});
const decodeTranscript = Schema.decodeUnknownEffect(Schema.fromJsonString(Transcript));
const encodeTranscript = Schema.encodeEffect(Schema.fromJsonString(Transcript));

export class LocalTextHistoryError extends Schema.TaggedError<LocalTextHistoryError>()(
  "LocalTextHistoryError",
  { reason: Schema.Literals(["invalid", "replayed", "changed", "storage"]) },
) {}

const isHistoryError = Schema.is(LocalTextHistoryError);

export const open = Effect.fn("AgentShare.LocalTextHistory.open")(function* (input: {
  readonly directory: string;
  readonly owner: string;
  readonly model: string;
  readonly thread: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.thread))
    return yield* new LocalTextHistoryError({ reason: "invalid" });
  const filename = path.join(input.directory, `${input.thread}.json`);
  const lock = yield* Semaphore.make(1);
  const read = Effect.fn("LocalTextHistory.read")(
    function* () {
      if (!(yield* fs.exists(filename)))
        return {
          owner: input.owner,
          model: input.model,
          messages: [],
          attempts: [],
          lastAttempt: null,
        } satisfies typeof Transcript.Type;
      if ((yield* fs.stat(filename)).size > 2n * 1024n * 1024n)
        return yield* new LocalTextHistoryError({ reason: "invalid" });
      const value = yield* fs.readFileString(filename).pipe(Effect.flatMap(decodeTranscript));
      if (value.owner !== input.owner || value.model !== input.model)
        return yield* new LocalTextHistoryError({ reason: "changed" });
      return value;
    },
    Effect.mapError((error) =>
      isHistoryError(error) ? error : new LocalTextHistoryError({ reason: "storage" }),
    ),
  );
  const write = Effect.fn("LocalTextHistory.write")(
    function* (value: typeof Transcript.Type) {
      const contents = yield* encodeTranscript(value);
      if (new TextEncoder().encode(contents).byteLength > 2 * 1024 * 1024)
        return yield* new LocalTextHistoryError({ reason: "invalid" });
      yield* fs.makeDirectory(input.directory, { recursive: true, mode: 0o700 });
      yield* writeFileStringAtomically({ filePath: filename, contents });
    },
    Effect.mapError((error) =>
      isHistoryError(error) ? error : new LocalTextHistoryError({ reason: "storage" }),
    ),
  );
  return {
    read,
    begin: Effect.fn("LocalTextHistory.begin")((attempt: string) =>
      lock.withPermit(
        Effect.gen(function* () {
          const current = yield* read();
          if (current.attempts.includes(attempt))
            return yield* new LocalTextHistoryError({ reason: "replayed" });
          yield* write({
            ...current,
            attempts: [...current.attempts, attempt],
            lastAttempt: { id: attempt, status: "pending" },
          });
          return current.messages;
        }),
      ),
    ),
    complete: Effect.fn("LocalTextHistory.complete")(
      (attempt: string, prompt: string, answer: string) =>
        lock.withPermit(
          Effect.gen(function* () {
            const current = yield* read();
            if (current.lastAttempt?.id !== attempt || current.lastAttempt.status !== "pending")
              return yield* new LocalTextHistoryError({ reason: "changed" });
            yield* write({
              ...current,
              messages: [
                ...current.messages,
                { role: "user", content: prompt },
                { role: "assistant", content: answer },
              ],
              lastAttempt: { id: attempt, status: "completed" },
            });
          }),
        ),
    ),
    interrupt: Effect.fn("LocalTextHistory.interrupt")((attempt: string) =>
      lock.withPermit(
        Effect.gen(function* () {
          const current = yield* read();
          if (current.lastAttempt?.id !== attempt || current.lastAttempt.status !== "pending")
            return;
          yield* write({ ...current, lastAttempt: { id: attempt, status: "interrupted" } });
        }),
      ),
    ),
  };
});
