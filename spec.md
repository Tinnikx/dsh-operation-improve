# DeepSeek Harness 插件系统工程文档

> 版本：0.1.2-rc.1  
> 分析对象：https://github.com/deepseek-ai/deepseek-harness  
> 分析方式：GitHub 在线源码分析（非本地源码）

## 项目概述

DeepSeek Harness（DSH）是一个以插件为核心架构的 AI Agent 运行时框架，项目口号为 **"Everything is a Plugin"**。它基于 [Cordis](https://github.com/cordiverse/cordis) 微内核构建，采用依赖注入（DI）+ 事件驱动 + 配置驱动的三层架构，将所有功能模块（LLM 适配、工具执行、会话管理、文件系统、沙箱安全等）均实现为可独立加载、热更新、组合替换的插件。

## 仓库结构

```
deepseek-harness/
├── apps/cli/                    # CLI 应用入口
│   └── src/
│       ├── bin.ts               # 命令行主入口（profile/plugin/dump-config 三模式）
│       ├── plugin.ts            # 插件管理 CLI（pnpm 转发器）
│       └── profile-boot.ts      # Profile 启动序列
├── apps/web/                    # Web GUI 应用
├── packages/                    # 核心包（每个子系统一个独立包）
│   ├── boot/                    # 应用启动胶水层
│   │   ├── app-boot/            # boot()、loadProfile、composeEntries
│   │   └── cmdline/             # 命令行参数解析
│   ├── bundle/                  # 运行场景组合
│   │   ├── base/                # 基础 bundle（~90+ 核心插件）
│   │   ├── web-app/             # Web 应用 bundle
│   │   ├── sdk-minimal/         # 最小 SDK bundle
│   │   ├── sdk-app/             # SDK 应用 bundle
│   │   ├── acp-app/             # ACP 自动化 bundle
│   │   └── headless/            # 无头运行 bundle
│   ├── core/                    # 核心服务
│   │   ├── agent/               # AgentRegistry 服务
│   │   └── session/             # Session 管理
│   ├── client/                  # 前端 UI 模块（1457 项）
│   ├── host/                    # 宿主端服务
│   │   └── plugin-inventory/    # 插件清单网关
│   ├── llm/                     # LLM 适配器
│   ├── skill/                   # 技能系统
│   └── ...                      # 其他子系统包
├── vendor/                      # 内置依赖
│   ├── cordis/                  # 插件 DI 框架（微内核）
│   │   └── src/
│   │       ├── context.ts       # Context：基于 Proxy 的 DI 容器
│   │       ├── registry.ts      # RegistryService：插件注册表
│   │       ├── fiber.ts         # Fiber：插件生命周期状态机
│   │       ├── service.ts       # Service：命名服务基类
│   │       ├── reflect.ts       # ReflectService：服务解析 Proxy
│   │       ├── events.ts        # EventsService：事件总线
│   │       └── logger.ts        # LoggerService：日志
│   ├── loader/                  # 配置驱动的插件加载器
│   │   └── src/
│   │       ├── index.ts         # Loader 服务（继承 EntryTree）
│   │       ├── internal.ts      # Node ESM 模块加载器包装
│   │       └── config/
│   │           ├── entry.ts     # Entry 类：单个插件节点生命周期
│   │           ├── tree.ts      # EntryTree：条目树 CRUD
│   │           ├── group.ts     # EntryGroup：子条目容器
│   │           ├── isolate.ts   # Realm 隔离机制
│   │           └── utils.ts     # JS 表达式求值/插值
│   ├── hmr/                     # 热模块替换服务
│   ├── schemastery/             # Schema 验证
│   └── ...
├── docs/                        # 文档目录
├── scripts/                     # 构建/发布脚本
└── [配置文件]                    # tsconfig.json, vitest.config.ts 等
```

## 文档索引

| 文档 | 路径 | 内容 |
|------|------|------|
| 插件系统详细文档 | [`docs/0.1.2-rc.1.md`](docs/0.1.2-rc.1.md) | 插件逻辑入口文件位置、逻辑实现精要、如何实现自己的插件 |

## 分析任务记录

| 任务 ID | 任务名称 | 负责人 | 状态 | 关键发现 |
|---------|----------|--------|------|----------|
| t1 | 查找插件系统逻辑入口文件 | entry-finder | ✅ 完成 | Cordis 框架 5 个入口文件、Loader 6 个入口文件、CLI 3 个入口文件、Bundle 6 个组合定义 |
| t2 | 分析插件 API 接口 | plugin-api-analyst | ✅ 完成 | 服务注入机制、ctx 访问、工具/设置/命令注册、远程协议、类型系统 |
| t3 | 分析插件生命周期管理 | plugin-lifecycle-analyst | ✅ 完成 | 7 阶段生命周期（Define→Approval→HostStart→ClientStart→Running→Stop→Undefine）、双半架构 |
| t4 | 分析插件配置系统 | plugin-config-analyst | ✅ 完成 | cordis.patch.yml 格式、4 层配置合成、热重载、原子写入、托管区段 |
| t5 | 分析插件扩展点 | plugin-extension-points-analyst | ✅ 完成 | 5 种事件模式、工具执行管道、能力缝隙、UI 渲染器、子代理/工作流 |
| t6 | 整合并撰写文档 | entry-finder | ✅ 完成 | 本文档 + docs/0.1.2-rc.1.md |
| t7 | 审查文档质量 | reviewer | ⏳ 待审查 | — |

## 核心架构特征

1. **微内核 + DI**：Cordis 提供 `Context`（基于 Proxy 的服务容器）+ `RegistryService`（插件注册表）+ `Fiber`（插件生命周期状态机）
2. **配置驱动加载**：通过 `Loader` 服务读取 YAML 配置树，动态 import 插件模块并挂载
3. **分层组合**：Bundle 层 → Profile 用户层 → Home 用户层 → Overlay 层，通过 patch 按 id 合并
4. **热更新**：HMR 服务监控文件变更，自动清除模块缓存并重新加载插件
5. **作用域隔离**：Realm/LocalRealm/GlobalRealm 机制实现服务级隔离
6. **事件驱动通信**：支持 emit/waterfall/parallel/serial/bail 五种事件分发模式

## 技术栈

- **运行时**：Node.js ^22.19.0 || >=24.0.0
- **包管理**：pnpm 11.7.0（monorepo workspace）
- **模块系统**：ESM（`"type": "module"`）
- **构建**：tsdown
- **测试**：vitest
- **插件框架**：Cordis（内置 vendor）
- **Schema 验证**：zod + schemastery
