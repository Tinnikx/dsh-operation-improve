# 004 worker 线程持久化后端（流式期间会话切换提速）

- 目标：多个子 agent 高频流式输出时，切换/载入会话不再被 JSONL 落盘的同步 zstd+fsync 拖慢。验收方式：测试栈起多个流式子 agent，切换会话的载入耗时对比 stock 后端可感知下降。
- 范围：新增一个 host 侧持久化服务插件（`./persistence` 子路径导出），用 worker 线程承载 stock JSONL 后端的物理读写；不动 harness 本体。
- 结论：**作废**（用户确认，2026-09-12）。实现代码、产物与仓库里的引用已删除；本记录留档，写清为什么不该做、以及删掉的是哪些东西。

## 为什么作废

- **根因已被上游解决。** 当时的诊断是 0.1.2-rc.1 的 JSONL 后端在**主线程**同步做 JSON.stringify + zstd 压缩 + fsync，N 个子 agent 的写批把事件循环打满。运行时的 0.1.5-rc.2 已经全部异步：写路径 `compressZstdFrame()`（`promisify(zstdCompress)`）+ `await handle.writeFile()` + `await handle.sync()`，读路径 `decompressZstdFrame()` → `zstdDecompressAsync`（同步解码器只是文档标注的 fallback），整代校验另跑独立 Worker（`verifyCurrentGenerationInWorker`）。验证方式：读 `<运行时>/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js` 的 `compressZstdFrame` / `appendLines` / `readStoredLog` / migration-verifier 几段。
- **本设计依赖的切点不存在了。** 0.1.5-rc.2 的 `@deepseek-ai/dsh-session-persistence` 既不导出 `PersistenceCoordinator` 也不导出 `PersistenceBackend`（照着写 `import { PersistenceCoordinator }` 会直接失败），`SessionPersistence` 只剩一个薄 Service 基类；jsonl 侧是一个整体类 `JsonlSessionPersistence extends SessionPersistence`。验证方式：`grep -rn "PersistenceCoordinator\|PersistenceBackend" <运行时>/node_modules/@deepseek-ai/*/lib/*.js` 零命中，`dsh-session-persistence/lib/index.js` 末尾的导出清单里也没有这两个名字。
- **两个当时没发现、后来实测出来的问题**（随代码一起删掉，不再修）：宿主半边顶部两条静态 `import '@deepseek-ai/cordis'` / `'@deepseek-ai/dsh-session-persistence'` 在插件以 `link:` 装进 profile 时从仓库真实路径解析，`ERR_MODULE_NOT_FOUND`；`locate.js` 的路径编码停在 0.1.2-rc.1 的 `session.jsonl`，而 0.1.5-rc.2 的文件名带代次（version 0 → `session.jsonl`，其余 → `session.vN.jsonl` 再叠压缩后缀，当前 version 3）。

## 删掉的东西

作废时一次清干净，仓库里不再有引用：

- `src/persistence/{index,proxy,worker,locate}.js`
- `lib/persistence.js`、`lib/persistence-worker.js`
- `scripts/build.mjs` 的两个持久化入口
- `package.json` 的 `./persistence` 导出
- `cordis.patch.yml` 里注释着的持久化行、stock `session-persistence-jsonl` 禁用行与 `FIXME(004)` 段
- `README.md` 的 `persistence/` 布局条目与「装进 profile 后接管会话持久化」一段

## 测试cases

无。实现期跑过的三个手工探针随删除一起失效，留作记录：`DSH_ESBUILD_ROOT=<dsh-desktop 仓> node scripts/build.mjs`（exit 0）；`import('./lib/persistence.js')`（复现加载失败）；`logPath()` 与真 home 的 `sessions/` 对拍（复现路径错）。

## 未完成项与下一步

无。将来若又要动持久化性能，第一步不是写 worker，而是先量 0.1.5-rc.2 stock 在流式负载下的会话切换/载入耗时——上游换过实现，旧诊断不能直接复用。

## 坑

- **依赖上游内部 seam 的插件，动手前先确认 seam 还在。** 这整套建立在 `PersistenceCoordinator` + `PersistenceBackend` 上，运行时升到 0.1.5-rc.2 后这两个名字消失，代码从「有 bug」变成「没有挂载点」。判据是运行时包的导出清单，不是文档、记录或记忆。
- **`link:` 安装下不要对运行时包写静态 `import '@deepseek-ai/*'`。** Node 按真实路径解析符号链接，仓库目录向上找不到这些包；表现不是「这个插件失效」而是整棵树加载失败，连 profile 都起不来。
- **shipped 的文件名与路径编码会随 harness 版本变。** jsonl 日志从 `session.jsonl` 变成 `session.vN.jsonl`（当前 v3），任何在主线程复刻 shipped 路径计算的代码都得跟着重读；`locate()` 是同步接口，推不给 worker。
