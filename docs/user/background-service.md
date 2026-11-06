# Run the AgentShare workbench in the background

On macOS and Linux, the standalone client can keep a workbench available without an open terminal. Install the `agentshare-client` command first; see [installation](./install.md).

```sh
agentshare-client service install
agentshare-client service status
agentshare-client service restart
agentshare-client service uninstall
```

The service uses `~/.agentshare-client` by default. To select another workbench, pass the same `--base-dir /absolute/path` to each command. Removing the service preserves conversations, settings and Core. Restarting interrupts running tasks and disconnects clients; wait for tasks to finish first.

## Configure access and Core

Edit `~/.agentshare-client/service.env` (or `service.env` in your chosen base directory), then restart the service:

```dotenv
AGENTSHARE_CLIENT_PORT=3773
AGENTSHARE_CLIENT_LAN=false
```

A fresh service accepts local connections only. Set `AGENTSHARE_CLIENT_LAN=true` to permit connections from private networks, then pair the other client with this workbench. An explicit `AGENTSHARE_CLIENT_HOST` overrides that choice. Pairing and access scopes still apply. Only enable network access on a network you trust.

The workbench starts the bundled Go Core when an AgentShare capability is first requested. To choose a separate Core data directory or Console, add `AGENTSHARE_HOME` and `AGENTSHARE_CONSOLE_URL` to this file. Keep your Console and account configuration consistent across restarts.

Use literal `KEY=VALUE` entries; quote values containing spaces or `#`. Shell commands and variable expansion are not evaluated. Entries override the service environment except for `PATH`, `AGENTSHARE_CLIENT_HOME`, `AGENTSHARE_CLIENT_SERVICE_UNIT` and `AGENTSHARE_CLIENT_SERVICE_CONTEXT`. Restrict a file containing credentials with `chmod 600`.

## Platform behavior

On macOS, the service runs while your user is logged in. Keep the Mac awake for remote access. Its launch agent is `app.agentshare.client.service`, separate from the desktop app. Installation over SSH may require an active graphical login.

Linux requires systemd user services. The unit is `agentshare-client.service`. Installation checks whether the user service manager and lingering are available. If a prerequisite is missing, follow the reported recovery command as your normal user; do not run the client as root.

Windows hosts can use the desktop app or `agentshare-client serve` in a terminal. Keep that process running while another device uses its workbench.

## Diagnose startup

Start with `agentshare-client service status`; it reports the log location and whether the service is installed and running. On Linux, also inspect:

```sh
systemctl --user status agentshare-client.service
journalctl --user -u agentshare-client.service
```

On macOS, check System Settings → General → Login Items if startup is disabled. A background process may need operating-system access to the workspace directory. Read the service log before changing permissions.

Use [updating](./updating.md) to move an installed client to a verified release. Updating the executable and restarting the service are separate actions when a task is still running.
