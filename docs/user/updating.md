# Update AgentShare Client

The client and the execution computer can run on different machines. Update each
from the AgentShare release channel it was installed from. Keep the same workbench
and Core directories to preserve new-client sessions, login and settings.

## Desktop preview

Install the verified replacement build for the same platform and architecture.
Use the app's Quit action before replacing it, then start the new build with the
same data directories. Closing its window can leave the workbench running in the tray.

The current local preview is upgraded with verified artifacts. Automatic desktop
updates require an AgentShare update feed configured for the build. When no feed
is configured, the app reports that updates are unavailable; use a verified build.

## Standalone execution host

For an installation created by this repository's standalone installer:

```bash
agentshare-client update
```

To choose an exact published version:

```bash
agentshare-client update <version>
```

The host obtains its archive from the AgentShare repository and verifies the
release checksum before promotion. An unavailable release or failed verification
leaves the current installation in place. A successful installation does not
mean every running process has restarted: follow the command's restart instructions.

If running from source, update the checkout and rebuild instead of replacing the
runtime with a release archive.

## Mobile

Install the verified replacement package with the same app identifier and signing
identity. Keep the same account service. The application identifier alone does not
select Dev or production. Native secure storage retains device credentials during
a compatible in-place upgrade; switching identities uses a separate app profile.

## Continue threads after restarts

Finish active turns before a planned upgrade when practical. Inspect unfinished
threads after reconnecting. A completed paid task remains completed; an interrupted
or uncertain request must be checked before submitting another prompt. Check the
wallet records to confirm charges instead of repeating a task to test settlement.

## Provider tools

Client updates and model-tool updates are separate. In **Settings → AgentShare →
Manage coding tools**, select the execution computer, inspect its installed Codex
and Claude versions and choose the version for subsequent tasks. An in-progress
task continues with the process it already started. Refresh the operation record
after a disconnect before starting another installation.
