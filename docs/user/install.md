# Install AgentShare Client

AgentShare Client provides a workbench on macOS, Windows and Linux. Its iPhone,
iPad and Android apps connect to an execution computer; files, terminals and coding
agents run on that computer. Set up the execution computer first. Copied thread and prompt links open the AgentShare Client app; pair another device using the execution computer’s connection link.

## Desktop app

Install a verified AgentShare Client build for your platform. Release artifacts
belong to [agentshare-client](https://github.com/koenigseggposche/agentshare-client/releases).
The current preview is distributed as locally verified builds. Its macOS builds
use development signing; official signing and notarization are part of release preparation.

Open **Settings → Account and security** to sign in and manage authorized devices.
Consumption is available under the account's advanced controls. Use **Wallet and records**
for balances, model charges and sharing earnings.

In **Models and tools**, use **Model connections** to browse and add conversation models,
**Local models** to download and run models, **Model sharing** to manage sources and access,
and **Coding tools** to install or select Codex and Claude versions. These host settings
apply to the selected execution computer. Sign in to an official source on that computer
before sharing it. Consumption, pausing sharing and stopping sharing are separate controls.

Set **General → Interface language** to English or Simplified Chinese. It controls this
client's interface and menus, updates without restarting, and is remembered at the next
launch. Each device keeps its own preference. Changing language preserves drafts and
selected models; names, conversation content, code and external output remain original.

The default workbench directory is `~/.agentshare-client`; development desktop
builds use its `dev` subdirectory. An explicit data directory selects an independent
workbench. macOS 12 is outside the supported platform target.

### The `agentshare-client` command

Open **Settings → About** and choose **Install** next to **agentshare-client command**.
On macOS and Linux this adds a link to a folder on your `PATH`; on Windows it adds
the app's command folder. Open a new terminal afterwards. **Remove** removes the
client-owned PATH entry or link. The separate Go Core command is `agentshare`.

With the desktop app running on the same computer:

```bash
agentshare-client app
agentshare-client app ../my-project
```

This opens a new thread for the directory, adding the project if needed. Start
or update the desktop app if the command cannot reach it.

## Standalone execution host

For a published standalone release, run this checkout's installer:

```bash
sh scripts/install.sh
```

On Windows, from PowerShell:

```powershell
& .\scripts\install.ps1
```

The installer downloads from the AgentShare repository, verifies SHA-256 and
creates `agentshare-client` in `~/.local/bin`. Add that directory to `PATH` if needed.
`AGENTSHARE_CLIENT_VERSION` selects an exact published version; `AGENTSHARE_CLIENT_CHANNEL` selects
`stable`, `nightly` or `preview`. The default data directory is `~/.agentshare-client`;
`AGENTSHARE_CLIENT_HOME` selects another directory.

| Task                                | Command                       |
| ----------------------------------- | ----------------------------- |
| Start the host and open its web app | `agentshare-client`           |
| Start without a browser             | `agentshare-client serve`     |
| Inspect available commands          | `agentshare-client --help`    |
| Update a standalone installation    | `agentshare-client update`    |
| Remove a standalone installation    | `agentshare-client uninstall` |

Use a separate `--base-dir` for an independent host. Connect to an already running
host rather than starting another server against its data directory.

### Intel Macs

The standalone archive matrix covers macOS arm64, Linux arm64/x64 and Windows
arm64/x64. For a machine outside that matrix, prepare and verify a source build
before using it as an execution host.

## Mobile app

Install the signed AgentShare development package prepared for your iPhone,
iPad or Android device. A standalone Release package runs without Metro.
iOS builds target iOS/iPadOS 18 or later. Development and production builds use
separate application identifiers and account-service configuration.

Open **Settings → Account and security → My account** on mobile to sign in independently
of execution computers. **Wallet and records** shows that account's balances and records.
Choose **Execution host** on either page to manage the selected computer's account or
wallet. The model and coding-tool pages use the selected execution host. To run coding
tasks, create a pairing link on the execution computer in **Settings → Sharing & access**,
then add it on mobile. The granted permissions determine available host operations.

## Next steps

- [Working with threads](./thread-sidebar.md): start and organize tasks.
- [Permission modes](./permission-modes.md): control agent actions.
- [Updating](./updating.md): update this client and execution hosts.

## Use a native coding terminal

Open **Coding terminal** from a project conversation's workspace toolbar or menu.
Choose a model and source; the terminal starts from that workspace directory, which
can be changed to another absolute directory on the execution host. Manage installed
versions separately in **Settings → Coding tools**. Starting a terminal requires an
up-to-date sharing service and access-management and terminal-operation permissions.

Leaving the page keeps the task running. Return and select the original terminal
to continue; reconnecting does not resend the launch command. Use **Stop this
terminal** to end its task. Model access and billing use the host’s current account.
