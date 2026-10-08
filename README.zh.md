# dsh-plugin-subagent-model-route

给每个子代理标注它**实际运行使用的模型路由**，覆盖你查看子代理时的两个位置：父会话的目录列表，以及子代理会话自身的页头。

![目录列表：每行依次堆叠名称、mode/活动状态/模型徽标行、持久化标题](docs/effect-catalog-rows.png)

*父会话的目录列表：13 个子代理，每行分三行堆叠 —— 名称、`mode · 活动状态 · 路由` 徽标行、以及下方的持久化标题。图中显示的路由（`gpt-5.6-sol`、`gpt-6-astra`、`qwen3-coder-flash`、`deepseek-flash`）就是那些委派**实际跑在**的模型。*

![子代理会话页头：模型路由渲染在面包屑切换器旁](docs/effect-child-header.png)

*打开一个子代理会话：路由（`deepseek-flash`）显示在谱系面包屑旁、页头之中，位于只读的一次性子智能体提示之上。*

## 效果

只有两个面发生变化，其余一律不动：

| 面 | 改前 | 改后 |
| --- | --- | --- |
| 父会话目录行 | `name`，然后同一行显示 `title · 一次性 · 正在运行` | 三行：`name` / `一次性` `正在运行` `gpt-5.6-sol` / `title` |
| 子代理会话页头 | 只有面包屑切换器 | 面包屑切换器 + 模型路由 |

从未发出过请求的子代理**不显示**徽标。悬停徽标可看到完整的 `provider/model · reasoningEffort`，行的无障碍名称也会带上路由。

## 把「效果」说成「后果」

装之前值得先读。这个插件是刻意**遮蔽官方 UI** 的，这有代价：

1. **行变高。** 44px → 59px。下拉菜单高度上限为 `min(560px, 100vh - 140px)`，因此滚动前可见行数从约 12 行降到约 9 行。
2. **你 fork 了官方 UI 的这一小块。** 该座位的契约标记为 `replaceRisk: 'shadows-shipped-ui'`。官方对这两个 occupant 的任何改进 —— **包括 DeepSeek 自己以后加上模型列** —— **都不会进到你这里**；必须重新 vendor 并重新施加那两处修改（见 [PATCH-RECORD.md](./PATCH-RECORD.md)）。
3. **这一区域里官方 UI 的 bug 从此归你。** 渲染器是官方版本的逐字拷贝（连官方那个「重复 key」的 React 警告也一并继承）。
4. **样式表会被注入两份。** vendored 的 CSS module 是官方样式表的副本，页面里会同时存在。体量很小，且哈希类名因文件内容不同而不同，不会冲突。
5. **官方 occupant 是被遮蔽，不是被注销。** 它们仍注册着、但不渲染 —— 一点惰性开销。
6. **若同时装 `subagent-director`，会与该插件的 dock 重复。** 那个插件在输入框下方显示模型的模型读数，本插件显示在页头。在同一个视图里会看到路由出现两次，除非你去掉其中一个。
7. **路由是「最后一次请求」的路由。** 中途换过模型的子代理只显示最近一次；「没有徽标」的意思是「从未发出请求」，不是「未知」。
8. **只改这两个面。** 只读编辑器、侧边栏聊天标签、`@` 引用 source 都仍是官方的。
9. **卸载即完全还原。** 没有任何持久化状态，也没有 host 侧改动；把包从 profile 的 `bundles` 里移除并重启即可。
10. **启用需要重启宿主。** `dsh.client` 属于组合层配置，不热更新。

## 为什么必须做一个「遮蔽官方 UI」的插件

官方 `@deepseek-ai/dsh-client-ui-subagent` 决定了这两个面渲染什么，而它**无法被增补扩展**：`conversation.session.header.lineage` 是一个 `single` 单格，`registerOptions` 为空、不声明任何子插槽；行级插槽更是根本不存在。要从外部把路由加进去，只能接管这两个座位。

slot 注册表的规则是：**同一 cell 同 priority 第二次注册会抛错，不同 priority 则遮蔽**。官方两个 occupant 都占默认的 `0`，所以本插件以 `priority: -1` 注册：

| 座位 | 官方 occupant | 本插件如何接管 |
| --- | --- | --- |
| `conversation.session.header.lineage`（`single`） | `SubagentHeaderLineage` | `priority: -1` 遮蔽 |
| `conversation.session.header.actions`（`list`） | `SubagentCatalogAction`（id `subagent-catalog`） | 复用**同一 id** + `priority: -1` 原地替换 |

路由数据来自既有的持久化 `modelSelection` 投影（每次 `request/header` 记录），通过目录行本就在用的同一个 `summary.projectionValues` 读取 —— 因此**没有新增 RPC、没有 host 改动、没有新投影、没有新插槽**。

## 挂载

像任何本地插件一样作为 profile bundle 挂载：

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-plugin-subagent-model-route": "link:/path/to/dsh-plugin-subagent-model-route"
},
"dsh": { "profile": { "bundles": [
  // ...放在 @deepseek-ai/dsh-base 与 @deepseek-ai/dsh-web-app 之后
  "dsh-plugin-subagent-model-route"
] } }
```

或者用受支持的方式安装（它会替你改上面两处）：

```sh
dsh plugin --profile web add dsh-plugin-subagent-model-route     # 从 npm
dsh plugin --profile web add ./dsh-plugin-subagent-model-route   # 从本地 checkout
```

然后**重启**宿主。

## 开发

本目录的 `node_modules/` 是**仅供本机开发**的软链 shim，指向一个 harness checkout（宿主的 `react`/`react-dom`/`@deepseek-ai/*`，以及 monorepo 的工具链），因为 `@deepseek-ai/*` 在 npm 上只发布了 `0.0.1-rc.1` 占位版。在正常环境里按 `devDependencies` 列出的版本执行 `npm install` 即可替代它。

```bash
npm run check      # 类型检查 -> 构建 -> 无头冒烟（15 项）
npm run build      # tsdown：lib/index.js（宿主半包）+ lib/client/index.js（闭包工厂）
npm run watch
npm run smoke      # 在 jsdom 下真实渲染两个被接管的座位
```

[`tsdown.config.ts`](./tsdown.config.ts) 里的门外构建复刻了 monorepo 自己的 `clientBundle()` 预设所强制的两条契约 —— `window.__ModuleLoader__.load({ id, factory })` 交接格式，以及把 `*.module.css` 编译成哈希类名映射并注入带标记 `<style>` 的 lightningcss 流程 —— 因为那个预设靠 glob monorepo 目录来定位包，**无法构建 monorepo 之外的包**。构建**只需要 `tsdown` + `lightningcss`**：宿主提供的包始终保持 external、永不解析，这正是让 git 安装不会因「未发布的 `@deepseek-ai/*` 版本」而失败的原因。

`scripts/smoke.mjs` 让**真实产物**走**真实交接**，并断言（其中包括）产物的 `require` 集合恰好是 4 个平台种子模块（`react`、`react/jsx-runtime`、`react-dom`、`@deepseek-ai/dsh-client-ui-primitives`）—— 任何宿主模块表无法应答的请求都会在运行时必然抛错。

## 发布

完整清单、DSH 特有的坑与目录收录步骤见 [PUBLISHING.md](./PUBLISHING.md)。简版：填掉 `CHANGE-ME` 的仓库字段 → 在发布时构建好 `lib/` 发到 npm → 在干净 profile 里验证 → 给仓库打 `dsh-plugin` topic → 提交到各社区目录。

## 维护

vendored 渲染器锁定在 `deepseek-ai/deepseek-harness` `master @ 5badb15009`。当上游改动 `SubagentHeaderLineage.tsx` 或其样式表时，按 [PATCH-RECORD.md](./PATCH-RECORD.md) 重新 vendor 并重新施加那两处修改 —— 或者在拥有 harness checkout 的机器上，直接用等价的上游补丁（[UPSTREAM-PATCH.patch](./UPSTREAM-PATCH.patch)），那样完全不需要遮蔽。

## 许可证

MIT —— 见 [LICENSE](./LICENSE)。vendored 渲染器源自 MIT 许可的 `@deepseek-ai/dsh-client-ui-subagent`。
