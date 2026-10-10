# 修改记录：子代理模型标注

这份文档记录「子代理模型标注」功能**所需的全部改动**，供两条路复用：上游补丁与本插件。
两条路的代码是同一份，差别只在承载方式。

## 上游补丁的原始状态（已在本机撤销）

| 项 | 值 |
| --- | --- |
| 仓库 | `github.com/deepseek-ai/deepseek-harness` |
| 基线 | `master` @ `5badb15009`（= `origin/master`，即当时远端最新版） |
| 分支 | `feat/subagent-model-route`（本机保留，作为记录） |
| 提交 | `0114bcb47c` `feat(ui-subagent): show the model route each subagent ran on` |
| 补丁 | [`UPSTREAM-PATCH.patch`](./UPSTREAM-PATCH.patch)（`git am` 可用） |
| PR 正文 | [`UPSTREAM-PATCH-PR.md`](./UPSTREAM-PATCH-PR.md)（按仓库模板撰写） |

本机已 `git checkout master` 并重建 `lib/`，工作区无改动 —— 上游源码回到纯净状态。

## 功能改动（两处，插件完整继承）

### 1. 目录行：模型徽标独占一行

`SubagentHeaderLineage.tsx` 的 `CatalogRows` 行渲染：

```
改前： 名称
      title · 一次性 · 已完成              ← 长 title 会把后面的内容挤成省略号

改后： 名称
      一次性  已完成  openai/gpt-6-astra · high   ← 徽标行：mode · 活动状态 · provider/model · effort
      只输出一个词：CONTINUABLE-OK…                 ← title 独占一行
```

行高 44px → 59px；路由长到需要换行时该行变 74px；下拉菜单 `max-height: min(560px, 100vh-140px)` 可滚动。

### 2. 子代理会话页头：面包屑旁显示模型

`SubagentHeaderLineage` 组件（**仅 child 会话渲染**，root 会话仍 `parentId === undefined` 提前返回）在面包屑切换器旁渲染同一个读数。

### 数据来源（零 RPC、零 host 改动）

复用既有 `modelSelection` 投影 —— 它在每次 `request/header` 时记录实际使用的
`{ provider, model, reasoningEffort }`。目录行本就通过 `summary.projectionValues`
读取 `tokenUsage` / `subagentTiming`，模型只是同一对象上的第三个字段：

```
usedModel(selection) = selection.lastUsed ?? selection.next
```

## 逐文件改动（3 个源码文件）

| 文件 | 改动 |
| --- | --- |
| `src/client/SubagentHeaderLineage.tsx` | 新增 `SessionModelRef` 类型与 `usedModel()` / `modelRoute()` 纯函数；`CatalogRows` 计算路由、把路由写入 `aria-label`、把 mode/活动状态/**`provider/model · effort`** 渲染为徽标行、title 独占摘要行；`SubagentHeaderLineage` 在同一位置渲染同一读数 |
| `src/client/SubagentHeaderLineage.module.css` | 新增 `.badges`（`flex-wrap: wrap`，长路由整体换行而非被裁）/ `.badge` / `.model`（代码字体 + 次级色）/ `.sessionModel`；`.label` 加 `flex: none; min-width: 0`；`.summary` 加 `min-height: 15px`（无 title 时也保住行高） |
| `src/client/locales.ts` | zh/en 各加一个键 `model.title`（`实际使用模型：{value}` / `Model used: {value}`） |

## 仅属于上游补丁的部分（插件不需要）

| 文件 | 改动 | 插件里的对应物 |
| --- | --- | --- |
| `tests/conversation-ui.client.spec.tsx` | 修好 2 条断言（原断言合并字符串 `'正在扫描项目文件 · 可继续 · 正在运行'`），并新增 1 个覆盖模型徽标与页头读数的用例 | [`scripts/smoke.mjs`](./scripts/smoke.mjs)：15 项检查，真渲染两个面 |
| `README.md` / `README.zh.md` / `README.i18n.yaml` | 同步目录行描述并重录翻译配对哈希 | 本目录 [`README.md`](./README.md) |

## 为什么插件必须「遮蔽」而不是「增补」

`conversation.session.header.lineage` 的契约（生成目录
`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`）：

```
kind: 'single'   registerOptions: []   slotInject: ''   无 children
occupants: ['client-ui-subagent SubagentHeaderLineage']   replaceRisk: 'shadows-shipped-ui'
```

单格、无 id、无子插槽 → 没有任何「往里加东西」的接口。而 slot 注册表
（`packages/client/ui-slots/src/index.ts:1138`、`:1211`）规定：**同一 cell 同 priority
第二次注册会抛错，不同 priority 则遮蔽（越低越渲染）**。官方两个 occupant 都在默认
priority 0，所以插件以 `priority: -1` 接管，并且：
- `conversation.session.header.lineage` —— 直接抢占；
- `conversation.session.header.actions` —— 复用官方 id `subagent-catalog` 原地替换该 cell。
