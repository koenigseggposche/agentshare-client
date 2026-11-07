# Release AgentShare Client

For local setup and artifact commands, see [development](development.md). End users install a verified build using the [installation guide](../user/install.md).

## Current publication boundary

The `AgentShare preview builds` workflow is manually dispatched from this repository’s `main` branch. It builds x64 and arm64 previews for macOS, Windows and Linux against a complete, pinned Core commit. Configure `AGENTSHARE_CORE_READ_KEY` with a read-only deploy key scoped to `koenigseggposche/agentshare` before dispatching. The workflow keeps private Core source outside client packaging, builds Core from clean source and uploads installers, hashes and source metadata as workflow artifacts. These artifacts use development signing; install and verify them before promotion.

For a signed macOS acceptance build, set `macos_distribution=true`. The workflow checks `CSC_LINK` (base64 PKCS#12), `CSC_KEY_PASSWORD`, `APPLE_API_KEY` (private key contents), `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` before starting either macOS build. Pin a Core commit containing the `--macos-signing-identity` option. The two signed artifacts have the `agentshare-signed-preview-` prefix and carry the client and Core commits and checksums. Download them for acceptance from the workflow run.

The inherited release workflow remains restricted to the upstream repository. Configure AgentShare distribution signing, package ownership and trusted publishers for a publishing workflow. Verify the destination of every upload and update feed; development builds alone do not establish a distribution release.

The release repository is `koenigseggposche/agentshare-client`. CLI downloads and the npm launcher use its versioned release archives and `SHA256SUMS`. Desktop updater configuration requires an explicit repository; preview builds carry no update feed. Release notes and history links default to the AgentShare Client release repository. Keep preview artifacts separate from stable and nightly updates. The example environment leaves cloud identity, relay and diagnostics destinations unset; configure only your own deployment’s public identifiers before building. Cloud CLI login requires an explicit `T3CODE_HOSTED_APP_URL`; the build shares that destination with the web client. Without a hosted web service, copied thread and prompt links use the AgentShare Client app scheme, and pairing links use the execution host.

With provider update checks enabled, the workbench refreshes its native-tool model and compatibility manifest from the AgentShare Client release repository. Each build includes a bundled copy for offline use. Community and device catalogs come from Core.

## Build and verify

1. Use the Node and package-manager versions pinned by the root package. Run `vp run check:changed`.
2. Build a Go Core release for each target. Supply its manifest through `AGENTSHARE_CORE_MANIFEST` or `--core-manifest`. Packaging checks the target, API version, complete binary size and SHA-256.
3. Build desktop artifacts using the commands in [development](development.md#desktop-artifacts). Build standalone hosts with `node scripts/build-cli-archive.ts --help` for target options. Native dependencies must match the destination system.
4. Install the resulting packages and verify preserved account state, connections, wallet reads, shutdown and background behavior. An artifact hash or successful compilation does not replace installed-client acceptance.
5. Record the client, workbench, Core and tool versions together with full artifact hashes. Use separate staging paths and verify transferred artifacts before replacing an installed build.

For macOS distribution, build Core with `--macos-signing-identity` before handing its manifest to desktop packaging. Desktop packaging preserves those verified Core bytes. A desktop build with `--signed` requires Developer ID Application signatures on Core and the app, plus a stapled notarization ticket on the app. Configure an Associated Domains profile only for builds with cloud passkeys. Windows distribution requires its configured signing identity.

## npm launcher

The generated package and command are `agentshare-client`. Build it into an external staging directory:

```sh
node scripts/build-npm-launcher.ts --version 1.2.3 --output-dir /absolute/staging/npm-packages
```

This creates `agentshare-client/` and `agentshare-client.tgz`, including the MIT license. The launcher downloads the matching release archive, checks its hash and caches it in `~/.agentshare-client/runtime/versions/<version>`. `AGENTSHARE_CLIENT_HOME` selects another workbench directory; `AGENTSHARE_CLIENT_RELEASE_BASE_URL` selects an approved release mirror.

Confirm ownership of the npm package and configure its publisher before publishing. Publish the matching GitHub archives and checksums first. Use the build CLI’s `publish --dry-run` to inspect the package without uploading it. Update checks query the same package through the configured npm registry, with a public-registry fallback when npm is unavailable.

## Mobile distribution

Use distinct development and production app identifiers and account-service URLs. Release bundles embed `EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL`; keep it consistent during native generation and bundling.

Use a developer team with the required signing and distribution capabilities for store builds. The Personal Team variant is for device testing and omits remote push, Apple sign-in, universal links, widgets and the share extension. Keep simulator signing enabled when testing upgrades so existing secure-storage entries remain available.

Before distribution, verify host pairing, reconnects, permissions, independent personal-wallet access and supported older host/client versions. Complete the platform-specific review and payment setup for each distribution channel.
