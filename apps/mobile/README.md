# AgentShare Mobile

This guide covers building the native AgentShare client from source.

## Quickstart

> [!NOTE]
> Uses native modules so using Expo Go is not supported. You need to use the Expo Dev Client.

This app has three variants:

- `development`: Expo dev client, installable side-by-side as `AgentShare Dev`
- `preview`: persistent internal preview build, installable side-by-side as `AgentShare Preview`
- `production`: release build as `AgentShare`

Run commands from `apps/mobile`.

T3 Connect is optional and disabled in a fresh clone. Public configuration belongs in the
repository-root `.env` or `.env.local`, not an `apps/mobile/.env` file. See
[`../../.env.example`](../../.env.example).

## Development

For simulator, emulator, or Android phone development, boot or connect a device, then install the
native client that matches this checkout before starting Metro:

```bash
vp run mobile:install ios [simulator-udid]
# Or: vp run mobile:install android [emulator-or-phone-serial]
vp run dev:client
```

The device argument can be omitted when exactly one device is booted or connected. The helper
compares this checkout's Expo fingerprint and the installed binary with its last install record,
and reuses a matching client. Otherwise it installs the build for that fingerprint from
`~/.cache/t3code/native-clients/artifacts`, then the shared task cache, and builds only when
neither has it. One iOS simulator build serves every iPhone and iPad simulator, and one APK per
ABI (x86_64 or arm64-v8a) serves every emulator and phone of that ABI. Build output goes to the
log file it prints (`T3_NATIVE_CLIENT_VERBOSE=1` streams it instead). Builds are shared back when
your task-cache login (`bash infra/task-cache/install.sh`) can write. `T3_NATIVE_CLIENT_CACHE=read`
skips the upload and `off` skips the shared cache. Physical iPhones still use `vp run ios:dev`.

`--session <name>` installs into an agent-device session opened elsewhere, such as a device pool
or a cloud simulator, instead of a local device: `vp run mobile:install android --session pool-1
--metro http://<this-machine>:8081`. It uses only the cached build (x86_64 by default; `--abi`
for ARM) and fails with the next step when no machine has built this fingerprint yet.

For a read-only decision, run `node ../../scripts/mobile-native-client.ts check <ios|android>
[device]`: exit 0 means compatible, 2 means an install is needed, and 1 means an operational error.
An externally installed client is unverified until the helper installs it once.

Start Metro for an already verified dev client:

```bash
vp run dev:client
```

Metro keeps its transform cache between ordinary starts. If the cache itself is causing stale or
invalid output, clear it for one development-client start:

```bash
vp run dev:client:reset
```

Run that reset once after installing or changing the Uniwind dependency patch. Cached transforms
can otherwise reference its previous pnpm package path. Ordinary Metro starts still keep the cache.

Component edits use Fast Refresh. See [mobile development lifecycle](../../docs/internals/mobile-development.md)
before changing runtime ownership or refresh behavior.

Build and run the local iOS dev client:

```bash
vp run ios:dev
```

After changing a native dependency patch, rerun CocoaPods before rebuilding an existing iOS
project. pnpm gives each patch hash a new package path; Pods can otherwise keep compiling the
previous directory.

If your Xcode account only has a Personal Team, use a bundle identifier you control and opt into the
reduced-capability local build. It uses its own keychain group and omits widgets, the share extension,
remote push, universal links and native Sign in with Apple.

```bash
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.agentshare.dev \
vp run ios:dev
```

Build and install a self-contained Release app that does not need Metro:

```bash
vp run ios:release
```

The Personal Team equivalent also needs a unique bundle identifier:

```bash
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.agentshare \
vp run ios:release
```

For a self-contained development variant connected to the Dev account service:

```bash
EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL=https://as.taofanke.fun/console \
T3CODE_IOS_PERSONAL_TEAM=1 \
T3CODE_IOS_PERSONAL_TEAM_BUNDLE_ID=com.example.agentshare.dev \
vp run ios:dev:release
```

Keep simulator signing enabled so Xcode embeds the simulated app identifier and keychain access
group. Secure credential storage needs these entitlements on the simulator too.

For a self-contained Android development APK, keep the same account service in both steps:

```bash
export APP_VARIANT=development
export EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL=https://as.taofanke.fun/console
vp exec expo prebuild --platform android --no-install
(cd android && ./gradlew :app:assembleRelease)
```

The Android bundle task tracks the account service and app variant as cache inputs. Changing
either rebuilds the embedded JavaScript. The package name alone does not choose an account
service: omitting the URL uses the production service. Use separate app identities for Dev and
production so their stored credentials stay separate. These Release builds run without Metro.

Build and run the local iOS preview app:

```bash
vp run ios:preview
```

Inspect the resolved Expo config for a variant:

```bash
vp run config:dev
vp run config:preview
```

Run static checks for mobile native code:

```bash
node ../../scripts/mobile-native-static-check.ts
```

The native lint task runs SwiftLint for Swift plus ktlint and detekt for Kotlin. Missing native tools are reported as warnings and skipped locally. CI installs the default toolset from `apps/mobile/Brewfile` before running the native checks.

## EAS Builds

Create an Expo project named `agentshare-client` in your distribution account. Set
`AGENTSHARE_EAS_OWNER` and `AGENTSHARE_EAS_PROJECT_ID` (the project's UUID) in
the build shell or root `.env`. Use the same values in the corresponding EAS
build environment. Configure signing for each variant's package identifiers and
set `EXPO_PUBLIC_AGENTSHARE_CONSOLE_URL` to the Console used by the host Core.
For cloud connections, configure your own `T3CODE_CLERK_PUBLISHABLE_KEY`,
`T3CODE_CLERK_JWT_TEMPLATE`, and `T3CODE_RELAY_URL` in that environment.

Preview and production builds use native fingerprints. Development uses
`appVersion` to avoid recalculating the fingerprint for each Metro launch.
The native app loads its bundled release code with Expo Updates disabled.

Create a PR preview dev-client build manually:

```bash
vp run eas:ios:preview:dev
```

Create a cloud dev-client build:

```bash
vp run eas:ios:dev
```

Create a persistent preview build:

```bash
vp run eas:ios:preview
```

Android equivalents:

```bash
vp run eas:android:dev
vp run eas:android:preview:dev
vp run eas:android:preview
```
