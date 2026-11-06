#!/usr/bin/env node

// Android provides the outer mask; keep the app mark inside its adaptive safe area.
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import sharp from "sharp";

import { BRAND_ASSET_PATHS } from "./lib/brand-assets.ts";

const ADAPTIVE_CANVAS = 432;
const SPLASH_CANVAS = 1152;
const MARK_CANVAS = 64;
const OUTPUT_DIRECTORY = "apps/mobile/assets";
const BACKGROUND = "#1d1d1f";

export class AndroidIconRenderError extends Schema.TaggedError<AndroidIconRenderError>()(
  "AndroidIconRenderError",
  { layer: Schema.String, cause: Schema.Defect() },
) {}

const renderForeground = Effect.fn("androidIcons.renderForeground")(function* (
  repositoryRoot: string,
  size: number,
  fraction = 0.64,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = yield* fs.readFileString(
    path.join(repositoryRoot, BRAND_ASSET_PATHS.productionIconComposerProject, "Assets/mark.svg"),
  );
  const paths = source.match(/<path[^>]*\/>/g) ?? [];
  if (paths.length === 0) {
    return yield* new AndroidIconRenderError({
      layer: "foreground",
      cause: new Error("The AgentShare mark has no vector paths."),
    });
  }
  const scale = (size * fraction) / MARK_CANVAS;
  const padding = (size * (1 - fraction)) / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><g transform="translate(${padding} ${padding}) scale(${scale})">${paths.join("")}</g></svg>`;
  return yield* Effect.tryPromise({
    try: () => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer(),
    catch: (cause) => new AndroidIconRenderError({ layer: "foreground", cause }),
  });
});

const solidCanvas = Effect.fn("androidIcons.solidCanvas")(function* (size: number) {
  return yield* Effect.tryPromise({
    try: () =>
      sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
        .png()
        .toBuffer(),
    catch: (cause) => new AndroidIconRenderError({ layer: "background", cause }),
  });
});

const exportAndroidIcons = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(import.meta.dirname, "..");
  const foreground = yield* renderForeground(root, ADAPTIVE_CANVAS);
  const background = yield* solidCanvas(ADAPTIVE_CANVAS);
  const splashMark = yield* renderForeground(root, SPLASH_CANVAS);
  const splash = yield* Effect.tryPromise({
    try: () =>
      sharp({
        create: {
          width: SPLASH_CANVAS,
          height: SPLASH_CANVAS,
          channels: 4,
          background: BACKGROUND,
        },
      })
        .composite([{ input: splashMark }])
        .png()
        .toBuffer(),
    catch: (cause) => new AndroidIconRenderError({ layer: "splash", cause }),
  });
  const outputs = [
    ["android-icon-foreground.png", foreground],
    ["android-icon-mark.png", yield* renderForeground(root, 128, 1)],
    ["android-notification-icon.png", yield* renderForeground(root, 96, 1)],
    ["android-icon-background-dev.png", background],
    ["android-icon-background-nightly.png", background],
    ["android-splash-icon-dev.png", splash],
    ["android-splash-icon-nightly.png", splash],
    ["android-splash-icon-prod.png", splash],
  ] as const;
  for (const [name, contents] of outputs) {
    yield* fs.writeFile(path.join(root, OUTPUT_DIRECTORY, name), contents);
    yield* Console.log(`wrote ${OUTPUT_DIRECTORY}/${name}`);
  }
});

if (import.meta.main) {
  exportAndroidIcons.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
