# Workbench SQLite tables

Each AgentShare account has its own database at `accounts/<owner hash>/userdata/statev2.sqlite` under the client data directory. The development state variant uses `dev` instead of `userdata`. Workbench records cover projects, conversations, task runs, and device access. AgentShare Go services own balances, charges, and Provider settlement.

A fresh login has its own `account_generation`. Sessions and pairing links are valid within the login generation that issued them. Records created before the column was added receive generation `0`.

Set `WORKBENCH_DB` to the database path to inspect the pairing table structure with a read-only query.

```sh
sqlite3 -readonly "$WORKBENCH_DB" 'PRAGMA table_info(auth_pairing_links);'
```

| Table                                                   | Purpose                                                | Example columns                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `auth_pairing_links`                                    | One-time pairing credentials and their lifecycle       | `id`, `credential`, `method`, `account_generation`                              |
| `auth_sessions`                                         | Client sessions and access scopes                      | `session_id`, `subject`, `scopes`, `account_generation`                         |
| `effect_sql_migrations`                                 | Applied SQLite migrations                              | `migration_id`, `created_at`, `name`                                            |
| `mcp_app_model_context`                                 | Model context supplied by MCP apps                     | `thread_id`, `item_id`, `server`, `tool`                                        |
| `orchestration_command_receipts`                        | Project command results and deduplication              | `command_id`, `aggregate_kind`, `aggregate_id`, `accepted_at`                   |
| `orchestration_events`                                  | Project and earlier conversation event history         | `sequence`, `event_id`, `aggregate_kind`, `stream_id`                           |
| `orchestration_v2_command_receipts`                     | Conversation command results and deduplication         | `command_id`, `thread_id`, `command_type`, `accepted_at`                        |
| `orchestration_v2_effect_outbox`                        | Queued effects and retry state                         | `effect_id`, `command_id`, `thread_id`, `effect_type`                           |
| `orchestration_v2_events`                               | Ordered conversation events                            | `sequence`, `event_id`, `command_id`, `thread_id`                               |
| `orchestration_v2_legacy_imports`                       | Progress importing earlier T3 conversation records     | `thread_id`, `source_updated_at`, `shell_imported_at`, `transcript_imported_at` |
| `orchestration_v2_message_search`                       | Full-text index for conversation messages              | `text`                                                                          |
| `orchestration_v2_message_search_config`                | SQLite-managed full-text settings                      | `k`, `v`                                                                        |
| `orchestration_v2_message_search_data`                  | SQLite-managed full-text index blocks                  | `id`, `block`                                                                   |
| `orchestration_v2_message_search_docsize`               | SQLite-managed message lengths                         | `id`, `sz`, `origin`                                                            |
| `orchestration_v2_message_search_idx`                   | SQLite-managed full-text index segments                | `segid`, `term`, `pgno`                                                         |
| `orchestration_v2_projection_checkpoint_scopes`         | Checkpoint branches and their parent scopes            | `scope_id`, `thread_id`, `run_id`, `node_id`                                    |
| `orchestration_v2_projection_checkpoints`               | Checkpoints and their positions within a branch        | `checkpoint_id`, `thread_id`, `scope_id`, `run_id`                              |
| `orchestration_v2_projection_context_handoffs`          | Handoff of context to a new model session              | `context_handoff_id`, `thread_id`, `target_run_id`, `to_provider_thread_id`     |
| `orchestration_v2_projection_context_transfers`         | Context transfers between conversations                | `context_transfer_id`, `source_thread_id`, `target_thread_id`, `target_run_id`  |
| `orchestration_v2_projection_messages`                  | Messages and their streaming state                     | `message_id`, `thread_id`, `run_id`, `node_id`                                  |
| `orchestration_v2_projection_metadata`                  | Progress rebuilding read models from events            | `projection_name`, `schema_version`, `last_sequence`, `updated_at`              |
| `orchestration_v2_projection_nodes`                     | Execution steps and their parent steps                 | `node_id`, `thread_id`, `run_id`, `parent_node_id`                              |
| `orchestration_v2_projection_plans`                     | Plans attached to execution steps                      | `plan_id`, `thread_id`, `run_id`, `node_id`                                     |
| `orchestration_v2_projection_provider_session_bindings` | Mapping from model sessions to workbench conversations | `provider_session_id`, `thread_id`                                              |
| `orchestration_v2_projection_provider_sessions`         | Model session state                                    | `provider_session_id`, `thread_id`, `provider`, `status`                        |
| `orchestration_v2_projection_provider_threads`          | Model conversation state and ownership                 | `provider_thread_id`, `thread_id`, `owner_node_id`, `provider`                  |
| `orchestration_v2_projection_provider_turns`            | Model turns and their execution state                  | `provider_turn_id`, `thread_id`, `provider_thread_id`, `node_id`                |
| `orchestration_v2_projection_run_attempts`              | Each attempt at running a task                         | `attempt_id`, `thread_id`, `run_id`, `attempt_ordinal`                          |
| `orchestration_v2_projection_runs`                      | Task runs and their outcomes                           | `run_id`, `thread_id`, `ordinal`, `provider`                                    |
| `orchestration_v2_projection_runtime_requests`          | Requests for input or approval during execution        | `runtime_request_id`, `thread_id`, `node_id`, `provider_turn_id`                |
| `orchestration_v2_projection_subagents`                 | Child agent runs and their parent steps                | `subagent_id`, `thread_id`, `run_id`, `parent_node_id`                          |
| `orchestration_v2_projection_threads`                   | Conversation title, project, and active model session  | `thread_id`, `project_id`, `title`, `default_provider`                          |
| `orchestration_v2_projection_turn_items`                | Individual outputs and tool calls in a turn            | `turn_item_id`, `thread_id`, `run_id`, `node_id`                                |
| `orchestration_v2_thread_launch_workflows`              | Conversation startup progress and worktree preparation | `command_id`, `thread_id`, `project_id`, `status`                               |
| `orchestration_v2_turn_item_positions`                  | Ordering of individual items in a conversation         | `thread_id`, `turn_item_id`, `ordinal`                                          |
| `peer_environment_links`                                | Links and access metadata for peer workbenches         | `environment_id`, `secret_name`, `label`, `urls_json`                           |
| `projection_projects`                                   | Projects and workspace directories                     | `project_id`, `title`, `workspace_root`, `scripts_json`                         |
| `projection_thread_messages`                            | Message records for the earlier T3 read model          | `message_id`, `thread_id`, `turn_id`, `role`                                    |
| `projection_thread_pull_requests`                       | Pull requests linked to conversations                  | `thread_id`, `host`, `repository`, `number`                                     |
| `projection_thread_sessions`                            | Model session state for the earlier T3 read model      | `thread_id`, `status`, `provider_name`, `provider_session_id`                   |
| `projection_threads`                                    | Conversation summaries for the earlier T3 read model   | `thread_id`, `project_id`, `title`, `branch`                                    |
| `provider_session_runtime`                              | Provider runtime state and resume position             | `thread_id`, `provider_name`, `adapter_key`, `runtime_mode`                     |
| `pull_request_files_viewed`                             | Which pull request files a reviewer has viewed         | `provider`, `host`, `repository`, `number`                                      |
| `pull_request_review_guides`                            | Review guides saved for pull requests                  | `host`, `repository`, `number`, `guide_json`                                    |
| `scheduled_task_webhook_deliveries`                     | Incoming webhook requests for scheduled tasks          | `delivery_id`, `task_id`, `received_at`, `method`                               |
| `scheduled_task_webhook_pending`                        | Webhook work waiting to run or be grouped              | `delivery_id`, `task_id`, `coalesce_key`, `due_at`                              |
| `scheduled_task_webhook_relay_deliveries`               | Seen relay deliveries for deduplication                | `relay_delivery_id`, `task_id`, `seen_at`                                       |
| `scheduled_task_webhook_replay_keys`                    | Webhook replay keys and expiration times               | `task_id`, `replay_key`, `delivery_id`, `expires_at`                            |
| `scheduled_tasks`                                       | Task definitions, schedules, and target workspaces     | `task_id`, `title`, `prompt`, `enabled`                                         |
