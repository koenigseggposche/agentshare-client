# 工作台 SQLite 数据表

每个 AgentShare 账户使用独立的数据库，位于客户端数据目录下的 `accounts/<账户哈希>/userdata/statev2.sqlite`。开发状态使用 `dev` 代替 `userdata`。工作台保存项目、会话、任务执行记录和设备访问权限。余额、扣费和 Provider 结算由 AgentShare Go 服务负责。

每次新登录都有自己的 `account_generation`。会话凭据和配对链接只在签发时的登录代次内有效。添加这一列之前创建的记录使用代次 `0`。

将 `WORKBENCH_DB` 设为数据库路径，即可用只读查询查看配对表结构。

```sh
sqlite3 -readonly "$WORKBENCH_DB" 'PRAGMA table_info(auth_pairing_links);'
```

| 表                                                      | 用途                                 | 字段示例                                                                        |
| ------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------- |
| `auth_pairing_links`                                    | 一次性配对凭据及其使用状态           | `id`, `credential`, `method`, `account_generation`                              |
| `auth_sessions`                                         | 客户端会话及其访问权限               | `session_id`, `subject`, `scopes`, `account_generation`                         |
| `effect_sql_migrations`                                 | 已执行的 SQLite 迁移                 | `migration_id`, `created_at`, `name`                                            |
| `mcp_app_model_context`                                 | MCP 应用提供的模型上下文             | `thread_id`, `item_id`, `server`, `tool`                                        |
| `orchestration_command_receipts`                        | 项目命令的结果和去重记录             | `command_id`, `aggregate_kind`, `aggregate_id`, `accepted_at`                   |
| `orchestration_events`                                  | 项目及工作台早期会话格式的事件记录   | `sequence`, `event_id`, `aggregate_kind`, `stream_id`                           |
| `orchestration_v2_command_receipts`                     | 会话命令的结果和去重记录             | `command_id`, `thread_id`, `command_type`, `accepted_at`                        |
| `orchestration_v2_effect_outbox`                        | 待执行操作及重试状态                 | `effect_id`, `command_id`, `thread_id`, `effect_type`                           |
| `orchestration_v2_events`                               | 按顺序保存的会话事件                 | `sequence`, `event_id`, `command_id`, `thread_id`                               |
| `orchestration_v2_legacy_imports`                       | 工作台早期会话格式的导入进度         | `thread_id`, `source_updated_at`, `shell_imported_at`, `transcript_imported_at` |
| `orchestration_v2_message_search`                       | 会话消息的全文索引                   | `text`                                                                          |
| `orchestration_v2_message_search_config`                | SQLite 管理的全文索引设置            | `k`, `v`                                                                        |
| `orchestration_v2_message_search_data`                  | SQLite 管理的全文索引数据块          | `id`, `block`                                                                   |
| `orchestration_v2_message_search_docsize`               | SQLite 管理的消息长度                | `id`, `sz`, `origin`                                                            |
| `orchestration_v2_message_search_idx`                   | SQLite 管理的全文索引分段            | `segid`, `term`, `pgno`                                                         |
| `orchestration_v2_projection_checkpoint_scopes`         | 检查点所在的分支及其上级范围         | `scope_id`, `thread_id`, `run_id`, `node_id`                                    |
| `orchestration_v2_projection_checkpoints`               | 检查点及其在分支中的位置             | `checkpoint_id`, `thread_id`, `scope_id`, `run_id`                              |
| `orchestration_v2_projection_context_handoffs`          | 向新模型会话交接上下文的记录         | `context_handoff_id`, `thread_id`, `target_run_id`, `to_provider_thread_id`     |
| `orchestration_v2_projection_context_transfers`         | 会话之间转移上下文的记录             | `context_transfer_id`, `source_thread_id`, `target_thread_id`, `target_run_id`  |
| `orchestration_v2_projection_messages`                  | 消息及其流式输出状态                 | `message_id`, `thread_id`, `run_id`, `node_id`                                  |
| `orchestration_v2_projection_metadata`                  | 从事件生成界面查询数据的进度         | `projection_name`, `schema_version`, `last_sequence`, `updated_at`              |
| `orchestration_v2_projection_nodes`                     | 任务执行步骤及其上下级关系           | `node_id`, `thread_id`, `run_id`, `parent_node_id`                              |
| `orchestration_v2_projection_plans`                     | 执行步骤附带的计划                   | `plan_id`, `thread_id`, `run_id`, `node_id`                                     |
| `orchestration_v2_projection_provider_session_bindings` | 模型会话与工作台会话的对应关系       | `provider_session_id`, `thread_id`                                              |
| `orchestration_v2_projection_provider_sessions`         | 模型会话状态                         | `provider_session_id`, `thread_id`, `provider`, `status`                        |
| `orchestration_v2_projection_provider_threads`          | 模型端会话状态及所属的执行步骤       | `provider_thread_id`, `thread_id`, `owner_node_id`, `provider`                  |
| `orchestration_v2_projection_provider_turns`            | 模型端的交互轮次及其执行状态         | `provider_turn_id`, `thread_id`, `provider_thread_id`, `node_id`                |
| `orchestration_v2_projection_run_attempts`              | 每次执行任务的尝试                   | `attempt_id`, `thread_id`, `run_id`, `attempt_ordinal`                          |
| `orchestration_v2_projection_runs`                      | 任务执行及其结果                     | `run_id`, `thread_id`, `ordinal`, `provider`                                    |
| `orchestration_v2_projection_runtime_requests`          | 执行中等待输入或批准的请求           | `runtime_request_id`, `thread_id`, `node_id`, `provider_turn_id`                |
| `orchestration_v2_projection_subagents`                 | 子代理任务及其所属的执行步骤         | `subagent_id`, `thread_id`, `run_id`, `parent_node_id`                          |
| `orchestration_v2_projection_threads`                   | 会话标题、所属项目和当前模型会话     | `thread_id`, `project_id`, `title`, `default_provider`                          |
| `orchestration_v2_projection_turn_items`                | 单轮交互中的各项输出和工具调用       | `turn_item_id`, `thread_id`, `run_id`, `node_id`                                |
| `orchestration_v2_thread_launch_workflows`              | 创建会话及准备工作树的进度           | `command_id`, `thread_id`, `project_id`, `status`                               |
| `orchestration_v2_turn_item_positions`                  | 各项会话内容的显示顺序               | `thread_id`, `turn_item_id`, `ordinal`                                          |
| `peer_environment_links`                                | 其他工作台的连接及访问记录           | `environment_id`, `secret_name`, `label`, `urls_json`                           |
| `projection_projects`                                   | 项目及工作目录                       | `project_id`, `title`, `workspace_root`, `scripts_json`                         |
| `projection_thread_messages`                            | 工作台早期查询格式中的消息记录       | `message_id`, `thread_id`, `turn_id`, `role`                                    |
| `projection_thread_pull_requests`                       | 与会话关联的拉取请求                 | `thread_id`, `host`, `repository`, `number`                                     |
| `projection_thread_sessions`                            | 工作台早期查询格式中的模型会话状态   | `thread_id`, `status`, `provider_name`, `provider_session_id`                   |
| `projection_threads`                                    | 工作台早期查询格式中的会话摘要       | `thread_id`, `project_id`, `title`, `branch`                                    |
| `provider_session_runtime`                              | 模型运行状态及恢复位置               | `thread_id`, `provider_name`, `adapter_key`, `runtime_mode`                     |
| `pull_request_files_viewed`                             | 审阅者已查看的拉取请求文件           | `provider`, `host`, `repository`, `number`                                      |
| `pull_request_review_guides`                            | 拉取请求的审阅指南                   | `host`, `repository`, `number`, `guide_json`                                    |
| `scheduled_task_webhook_deliveries`                     | 定时任务收到的 Webhook 请求          | `delivery_id`, `task_id`, `received_at`, `method`                               |
| `scheduled_task_webhook_pending`                        | 等待执行或合并处理的 Webhook 工作    | `delivery_id`, `task_id`, `coalesce_key`, `due_at`                              |
| `scheduled_task_webhook_relay_deliveries`               | 用于去重的中继投递记录               | `relay_delivery_id`, `task_id`, `seen_at`                                       |
| `scheduled_task_webhook_replay_keys`                    | Webhook 防重放键及过期时间           | `task_id`, `replay_key`, `delivery_id`, `expires_at`                            |
| `scheduled_tasks`                                       | 定时任务定义、执行时间及目标工作目录 | `task_id`, `title`, `prompt`, `enabled`                                         |
