# Triage an issue

Triage lets your coding agent investigate an AgentShare Client problem. The agent
reads local diagnostics, checks the matching AgentShare Client source when available,
and prepares a report in the session for you to review. It asks before applying a fix.

## In the app

Open the command palette and choose **Triage an issue**. A new thread with no
project opens, with the triage playbook linked in the message. Choose any
provider, describe what went wrong after the link, and send. AgentShare Client gets the
source for the server's version while you write.

Triage runs on the machine of the thread or draft that you have open. With
nothing open, it uses your primary machine if that supports triage, or else the
first connected machine that does. The new thread shows the machine name, and on
mobile the palette row shows it before you start. The agent runs inside that workbench server, so it gives you any restart steps and does not do them itself.

## In a terminal

If the app does not start, or triage does not work in the app, run:

```sh
npx agentshare-client triage
```

It starts Claude Code or Codex in your terminal with the same instructions.
