# AgentShare Client

AgentShare Client is the AgentShare workbench for desktop, phone and tablet, based on a fork of [T3 Code](https://github.com/pingdotgg/t3code).

The workbench owns projects, coding tasks, files, terminals and conversation history. AgentShare's Go Core owns device capabilities and model access. Paid inference follows **Consumer → Core → Gateway → Provider**; the platform owns balances, billing and Provider settlement.

A phone or iPad connects to an execution computer. The task and its files run on that computer, while connected clients view the same conversation. Account and wallet access use the device's own AgentShare login.

## Development

This repository contains the web client, Electron desktop app, React Native mobile app and TypeScript workbench server. The Go Core is maintained in [agentshare](https://github.com/koenigseggposche/agentshare). Product integration and platform acceptance are in progress.

Use Node.js 26 and pnpm 12.14.0. Install dependencies, then start an isolated development workbench:

```sh
pnpm install
pnpm exec vp run dev --home-dir ./.t3
```

Use the actual local URL printed by the development runner. Keep the workbench data in this checkout's ignored `.t3` directory. Connect an AgentShare Core configured for the intended account environment when exercising AgentShare model and device capabilities.

For native desktop packaging, provide a Core artifact manifest for the matching platform and architecture. See [desktop artifact setup](docs/operations/development.md#desktop-artifacts). For mobile development, use [the native-client workflow](.agents/skills/test-t3-mobile/SKILL.md). Keep native signing material and runtime credentials outside this checkout.

Before contributing, read [AGENTS.md](AGENTS.md). Validate changes with:

```sh
pnpm exec vp run check:changed
```

## Attribution

T3 Code is developed by its upstream contributors. This fork retains the [MIT license](LICENSE) and [third-party notices](third-party-licenses). AgentShare's application identity is maintained in [assets](assets/README.md).

---

# AgentShare 客户端

AgentShare Client 基于 [T3 Code](https://github.com/pingdotgg/t3code) 的源码 fork 开发，面向电脑、手机和平板。

工作台负责项目、编程任务、文件、终端和会话历史。AgentShare 的 Go Core 负责设备能力和模型连接。付费推理经过 **Consumer → Core → Gateway → Provider**，账号余额、计费和 Provider 收益结算由平台负责。

手机或 iPad 连接一台执行电脑：任务和文件操作在电脑上运行，连接到这台电脑的客户端查看同一条会话。每台客户端使用自己的 AgentShare 登录查看账号和钱包。

## 开发

本仓库包含网页、Electron 桌面端、React Native 移动端和 TypeScript 工作台服务。Go Core 位于 [agentshare](https://github.com/koenigseggposche/agentshare) 仓库。产品集成和各平台验收仍在进行。

准备 Node.js 26 和 pnpm 12.14.0。安装依赖后，启动隔离的开发工作台：

```sh
pnpm install
pnpm exec vp run dev --home-dir ./.t3
```

使用启动日志打印的实际地址。开发数据保存在当前 checkout 已忽略的 `.t3` 目录。测试 AgentShare 模型和设备能力时，连接配置好对应账号环境的 AgentShare Core。

桌面打包需要提供与目标平台、架构匹配的 Core 产物清单，见[桌面打包配置](docs/operations/development.md#desktop-artifacts)。移动端开发见[原生客户端流程](.agents/skills/test-t3-mobile/SKILL.md)。签名材料和运行凭据保存在本仓库之外。

修改代码前阅读 [AGENTS.md](AGENTS.md)，修改后运行：

```sh
pnpm exec vp run check:changed
```

## 开源说明

T3 Code 由上游贡献者开发。本 fork 保留 [MIT 许可](LICENSE)和[第三方声明](third-party-licenses)。AgentShare 的应用标识和图标维护方式见 [assets](assets/README.md)。
