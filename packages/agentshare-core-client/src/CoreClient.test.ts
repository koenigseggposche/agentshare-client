import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- A real HTTP fixture verifies redirect and disconnected-socket behavior.
import * as NodeHttp from "node:http";
import type * as NodeNet from "node:net";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { FetchHttpClient } from "effect/http";

import * as CoreClient from "./CoreClient.ts";

const listen = (handler: NodeHttp.RequestListener) =>
  Effect.acquireRelease(
    Effect.tryPromise(
      () =>
        new Promise<ReturnType<typeof NodeHttp.createServer>>((resolve, reject) => {
          const server = NodeHttp.createServer(handler);
          server.once("error", reject);
          server.listen(0, "127.0.0.1", () => resolve(server));
        }),
    ),
    (server) =>
      Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            server.closeAllConnections();
            server.close(() => resolve());
          }),
      ),
  ).pipe(
    Effect.map((server) => `http://127.0.0.1:${(server.address() as NodeNet.AddressInfo).port}`),
  );

const fixture = Effect.fn("CoreClient.test.fixture")(function* (
  url: string,
  bootstrap?: CoreClient.CoreBootstrap["Service"],
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = yield* fs.makeTempDirectoryScoped();
  yield* fs.makeDirectory(path.join(directory, "core"));
  yield* fs.writeFileString(
    path.join(directory, "core", "runtime.json"),
    JSON.stringify({ url, capability: "generated-local-capability", pid: 12345 }),
  );
  return yield* CoreClient.CoreClient.pipe(
    Effect.provide(
      CoreClient.layer.pipe(
        Layer.provide(
          bootstrap
            ? Layer.succeed(CoreClient.CoreBootstrap, bootstrap)
            : CoreClient.layerExternalCore,
        ),
        Layer.provide(Layer.succeed(CoreClient.CoreHome, { directory })),
        Layer.provide(FetchHttpClient.layer),
      ),
    ),
  );
});

describe("AgentShare Core client", () => {
  it.live("resumes a model download through the idempotent install endpoint", () =>
    Effect.gen(function* () {
      const requests: Array<{ method: string | undefined; url: string | undefined; body: string }> =
        [];
      const url = yield* listen((request, response) => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk: string) => {
          body += chunk;
        });
        request.on("end", () => {
          requests.push({ method: request.method, url: request.url, body });
          response.setHeader("Content-Type", "application/json");
          response.end("{}");
        });
      });
      const client = yield* fixture(url);
      yield* client.command("resumeDownload", {}, "generated-model");
      assert.deepEqual(requests, [
        {
          method: "POST",
          url: "/v1/model-manager/install",
          body: JSON.stringify({ id: "generated-model" }),
        },
      ]);
      const invalid = yield* client.command("resumeDownload", {}, "../../other").pipe(Effect.flip);
      assert.equal(invalid.category, "invalid-operation");
      assert.equal(requests.length, 1);
      const input = {
        id: "00000000-0000-4000-8000-000000000001",
        owner: "generated-owner",
        kind: "import",
        path: "/generated/offline",
        model_id: "generated-model",
      };
      yield* client.command("importModel", input);
      yield* client.command("cancelModelOperation", {}, input.id);
      assert.deepEqual(requests.slice(1), [
        { method: "POST", url: "/v1/model-manager/operations", body: JSON.stringify(input) },
        { method: "POST", url: `/v1/model-manager/operations/${input.id}/cancel`, body: "{}" },
      ]);
      const selection = { owner: "generated-owner", source: "managed", version: "0.163.0" };
      yield* client.command("selectTool", selection, "codex");
      assert.deepEqual(requests.at(-1), {
        method: "POST",
        url: "/v1/tools/codex/selection",
        body: JSON.stringify(selection),
      });
      const installation = { id: input.id, owner: input.owner, service: "codex", kind: "install" };
      yield* client.command("installTool", installation);
      yield* client.command("cancelToolOperation", { owner: input.owner }, input.id);
      yield* client.read("toolOperations");
      assert.deepEqual(requests.slice(-3), [
        { method: "POST", url: "/v1/tools/operations", body: JSON.stringify(installation) },
        {
          method: "POST",
          url: `/v1/tools/operations/${input.id}/cancel`,
          body: JSON.stringify({ owner: input.owner }),
        },
        { method: "GET", url: "/v1/tools/operations", body: "" },
      ]);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
  it.live("rejects a non-loopback runtime before transmitting its credential", () =>
    Effect.gen(function* () {
      let requests = 0;
      const url = yield* listen((_request, response) => {
        requests++;
        response.end("{}");
      });
      const client = yield* fixture(url.replace("127.0.0.1", "localhost"));
      const error = yield* client.identity().pipe(Effect.flip);
      assert.equal(error.category, "invalid-runtime");
      assert.equal(requests, 0);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.live("never follows a Core redirect or forwards its capability to the destination", () =>
    Effect.gen(function* () {
      let destinationRequests = 0;
      const destination = yield* listen((_request, response) => {
        destinationRequests++;
        response.end("{}");
      });
      const url = yield* listen((request, response) => {
        assert.equal(request.headers.authorization, "Bearer generated-local-capability");
        response.writeHead(307, { location: destination });
        response.end();
      });
      const client = yield* fixture(url);
      const error = yield* client.identity().pipe(Effect.flip);
      assert.equal(error.category, "rejected");
      assert.equal(error.status, 307);
      assert.equal(destinationRequests, 0);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.live("reports an unknown mutation outcome without replaying the operation", () =>
    Effect.gen(function* () {
      let requests = 0;
      let preparations = 0;
      let invalidations = 0;
      const url = yield* listen((request, response) => {
        requests++;
        if (requests === 1) request.socket.destroy();
        else {
          assert.equal(request.method, "GET");
          response.setHeader("Content-Type", "application/json");
          response.end("{}");
        }
      });
      const client = yield* fixture(url, {
        prepare: Effect.sync(() => {
          preparations++;
        }),
        invalidate: Effect.sync(() => {
          invalidations++;
        }),
      });
      const error = yield* client.command("startSharing", { service: "codex" }).pipe(Effect.flip);
      assert.equal(error.category, "outcome-unknown");
      assert.equal(requests, 1);
      assert.equal(preparations, 1);
      assert.equal(invalidations, 1);
      yield* client.read("status");
      assert.equal(requests, 2);
      assert.equal(preparations, 2);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );

  it.live("refuses an incompatible Core contract and path traversal in a source target", () =>
    Effect.gen(function* () {
      let requests = 0;
      const url = yield* listen((_request, response) => {
        requests++;
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            api_version: 2,
            version: "generated",
            revision: "generated",
            owner: "generated-owner",
            device_id: "generated-device",
            paired: true,
            stopping: false,
            features: [],
          }),
        );
      });
      const client = yield* fixture(url);
      const protocol = yield* client.identity().pipe(Effect.flip);
      assert.equal(protocol.category, "invalid-response");
      const traversal = yield* client
        .command("stopSharing", {}, "../../shutdown")
        .pipe(Effect.flip);
      assert.equal(traversal.category, "invalid-operation");
      assert.equal(requests, 1);
    }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
  );
});
