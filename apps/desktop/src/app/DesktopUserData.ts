import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

export class DesktopUserDataInitializationError extends Schema.TaggedError<DesktopUserDataInitializationError>()(
  "DesktopUserDataInitializationError",
  {
    operation: Schema.Literal("create-directory"),
    resourcePath: Schema.String,
    category: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message() {
    return `Could not create the AgentShare desktop profile at ${this.resourcePath} (${this.category}).`;
  }
}

export const resolveUserDataPath = Effect.fn("desktop.userData.resolveUserDataPath")(
  function* (input: { readonly appDataDirectory: string; readonly isDevelopment: boolean }) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const destination = path.join(
      input.appDataDirectory,
      input.isDevelopment ? "agentshare-client-dev" : "agentshare-client",
    );
    yield* fs.makeDirectory(destination, { recursive: true }).pipe(
      Effect.mapError(
        (cause) =>
          new DesktopUserDataInitializationError({
            operation: "create-directory",
            resourcePath: destination,
            category: cause.reason._tag,
            cause,
          }),
      ),
    );
    return destination;
  },
);
