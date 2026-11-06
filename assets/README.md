# AgentShare brand assets

The application mark matches the existing AgentShare logo. Web and mobile headers share the vector geometry in `packages/client-runtime/src/agentShareBrand.ts`. Native icon sources are `agentshare/dev/app-icon.icon`, `agentshare/nightly/app-icon.icon`, and `agentshare/prod/app-icon.icon`; each uses `Assets/mark.svg` with the same geometry.

From the repository root:

```sh
vp run icons:export
vp run icons:export:android
vp run icons:check
```

The first command uses Apple Icon Composer to generate iOS, Windows, Linux and web assets. It also renders the original vector directly into a 1024×1024 macOS compatibility icon: an 824×824 body with a 100-pixel transparent margin. It does not alter a rendered Icon Composer bitmap. Generated macOS icons are included in `icons:check`.

Icon Composer 2 or newer is required on macOS. Set `ICON_COMPOSER_TOOL` to `Icon Composer.app/Contents/Executables/ictool` when automatic discovery does not find it. The exporter pins design generation 26.

Android artwork uses the same vector, with a transparent foreground inside the adaptive safe area and a solid background. The Android command also regenerates the monochrome icon, notification icon and splash artwork. App variants use the same AgentShare identity; their application names and stage badges distinguish development and preview builds.

Edit vector sources and regenerate assets. Do not edit PNG or ICO outputs by hand. The T3 icon imported by `T3AppIcon.tsx` represents the upstream GitHub app and is kept separate from AgentShare's application identity.
