# Install AgentShare Client

AgentShare Client provides a workbench on macOS, Windows and Linux. Its iPhone,
iPad and Android apps connect to an execution computer; files, terminals and coding
agents run on that computer. Set up the execution computer first. Copied thread and prompt links open the AgentShare Client app; pair another device using the execution computer’s connection link.

## Desktop app

Install a verified AgentShare Client build for your platform. Release artifacts
belong to [agentshare-client](https://github.com/koenigseggposche/agentshare-client/releases).
The current preview is distributed as locally verified builds. Its macOS builds
use development signing; official signing and notarization are part of release preparation.

Open **Settings → AgentShare → Account and consumption**, sign in to your account and enable consumption. Use the panels on that page to manage wallet and devices, conversation models, local models, sharing and coding tools. Switching panels keeps your forms and operation feedback.
Add an available community or flagship model to the workbench, then choose it in
a new thread. The account service records model charges and sharing earnings.
Manage the execution computer's Codex and Claude installations in **Manage coding tools**.

To share models, sign in to the model source on the execution computer, select
its sharing scope and start sharing in AgentShare settings. Consumption and
sharing have separate switches.

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

Open **Settings → AgentShare → My account** on mobile to sign in and read
personal balances and records independently of execution computers. Use
**Execution host** on the same page to choose a computer and manage its account,
wallet, conversation models, sharing or coding tools. To run coding tasks, create a pairing link on the execution
computer in **Settings → Sharing & access**, then add that connection on mobile.
The granted permissions determine which host operations the mobile app can use.

## Next steps

- [Working with threads](./thread-sidebar.md): start and organize tasks.
- [Permission modes](./permission-modes.md): control agent actions.
- [Updating](./updating.md): update this client and execution hosts.

## Use a native coding terminal

Under **Settings → AgentShare → Coding tools**, open the interactive terminal panel,
choose a model and source, then enter an absolute directory on the execution host
or select an existing project. This requires an up-to-date sharing service and
both access management and terminal operation permissions on the connection.

Leaving the page keeps the task running. Return and select the original terminal
to continue; reconnecting does not resend the launch command. Use **Stop this
terminal** to end its task. Model access and billing use the host’s current account.
