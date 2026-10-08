## Motivation

子代理目录只报告 mode、活动状态、token 用量与轮次耗时，不报告这个 child 实际跑在哪个模型上。于是「显式指定了路由的委派」与「继承主代理路由的委派」在 UI 上完全无法区分 —— 而 `subagent_role` 与 `workflow` 都支持逐次指定 provider/model，这正是需要核对的信息。

无对应同仓库 Issue：本仓库未开启 Issues，故无 `Fixes #NN` / `Related #NN` 可引用。

## Changes

- 命令、配置、API、协议、持久化格式的变化：**None**。
  - 复用既有 `modelSelection` 投影（每次 `request/header` 记录 provider/model/reasoningEffort），未新增投影、未改 schema、未加 RPC、未声明插槽。
- 用户可观察行为的变化：
  - **目录行**从「名称行 + `title · mode · 活动状态` 行」改为三行堆叠：名称 / 承载 mode、活动状态与模型路由的徽标行 / 由日志支撑的 title。徽标为 `flex: none`，因此过长的 title 不再能把模型挤到省略号之外（这是本次改动的直接动因）。
  - **子代理会话页头**在面包屑切换器旁新增同一模型读数；该读数与该渲染器现有的 gate 一致，root 会话仍渲染空。
  - 悬停模型徽标给出 `provider/model · reasoningEffort` 全量路由；未发出过请求的 child 不显示徽标。行的无障碍名称同步纳入 mode、活动状态、title 与模型。
- 文档：`README.md` / `README.zh.md` 的目录行描述同步更新，`README.i18n.yaml` 已按 `verify-translation-pairing --write` 重新记录。

## Testing

- `pnpm exec vitest run packages/client/ui-subagent/tests` —— 覆盖新增行为（目录行模型徽标、页头读数、无请求 child 不显示徽标）与既有目录行为回归。

  <details>
  <summary>Proof</summary>

  ```
  Test Files  3 passed (3)
       Tests  59 passed (59)
    Duration  4.00s
  ```

  新增用例：`annotates catalog rows and a child header with the route the session ran on`。
  同时更新了 `renders stable rows and catalog-addressed navigation` 的两条断言：原先断言合并字符串
  `'正在扫描项目文件 · 可继续 · 正在运行'` 与 `'一次性 · 当前未运行'`，现按拆分后的标题与徽标分别断言。

  </details>

- `pnpm exec tsc --noEmit -p packages/client/ui-subagent/tsconfig.json` —— 类型签名（`SessionSummary['projectionValues']`）与新增 props 均通过。

  <details>
  <summary>Proof</summary>

  ```
  tsc 退出码: 0
  ```

  </details>

- `pnpm run bundle`（该包，tsdown）+ `tsx scripts/run-oxlint.ts <改动文件>` —— 构建与 lint 门禁。

  <details>
  <summary>Proof</summary>

  ```
  [@deepseek-ai/dsh-client-ui-subagent/client] [CJS] lib/client.js  52.60 kB
  ✔ Build complete in 261ms

  Found 0 warnings and 0 errors.
  Finished in 1.9s on 3 files with 90 rules
  ```

  `git commit` 时 lefthook pre-commit 亦全绿：translation pairing / lint (staged) / third-party notices / whitespace / vendor manifest guard。

  </details>

- 真实会话手动验证 —— 在一个含 12 个子代理的父会话目录上核对，已确认与各 child 的物化投影值逐一对应。

  <details>
  <summary>Proof</summary>

  | 子代理 | 目录行显示 | 来源投影 `modelSelection.lastUsed` |
  | --- | --- | --- |
  | workflow + 显式 provider/model | `gpt-6-astra` | `openai/gpt-6-astra` |
  | workflow + 显式 provider/model | `qwen3-coder-flash` | `qwen/qwen3-coder-flash` |
  | `subagent_role` + 显式 model | `gpt-5.6-sol` | `openai/gpt-5.6-sol · medium` |
  | 未指定，继承默认路由 | `deepseek-flash` | `deepseek-official/deepseek-flash · high` |

  即 `subagent_role` 与 `workflow` 两条支持逐次指定路由的路径均已覆盖。

  </details>
