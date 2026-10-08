# 发布指南（PUBLISHING）

把本插件作为一个**完整的、可被 `dsh plugin add` 安装的 DSH 插件**发布出去需要做的事。
所有结论都标了来源；我把「官方文档硬性要求」与「社区惯例」分开写，未核实的地方明确标注。

---

## 0. 一句话流程

填元数据 → `npm run check` 全绿 → `npm pack --dry-run` 核对内容 → `npm publish` → 在**干净 profile** 里
`dsh plugin add` 验证 → 打 `dsh-plugin` topic → 提交到社区目录 → 记录兼容版本。

---

## 1. 发布前必须由你补上的三件事

1. **`repository` / `homepage` / `bugs` 三处 `CHANGE-ME`**。当前是占位符，必须换成真实可达的
   GitHub 仓库 —— 目录的「来源审计」要求条目对应真实可达仓库，不可达会被下架。
2. **npm 账号与包名**。`dsh-plugin-subagent-model-route` 这个名字要先确认可用（社区里同名前缀的
   插件不少，例如 `dsh-plugin-subagent-director` 已在 npm 上）。若被占用，改名前需同步改
   `cordis.patch.yml` 里的 `name:`（那里引用的是包名，Node 解析靠它）。
3. **GitHub 仓库本身**。`LICENSE`、`README.md`、`README.zh.md` 已就位；仓库建好后打上
   `dsh-plugin` topic（见第 6 节）。

---

## 2. 官方硬性要求

来源：仓库内官方文档 [`docs/user/develop/basic/publish.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)（已在本地完整阅读）与
[`docs/subsystems/client-modules.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.md)。

### 2.1 bundle 清单（`dsh.bundle`）

一个可被 `dsh plugin add` 安装的包，其 `package.json` 必须声明 `dsh.bundle.patch`，指向一个
YAML 补丁层；补丁里的行用**包名**引用，而不是相对源码路径：

```yaml
- insert:
    - id: subagent-model-route
      name: dsh-plugin-subagent-model-route
```

`dsh plugin add` 会把包加入 profile 的 `dependencies`，并因为 `dsh.bundle` 存在而把包名追加进
`dsh.profile.bundles`。**没有 `dsh.bundle` 声明的包只会作为普通依赖装上，dsh 会告警且不激活任何层。**

### 2.2 客户端清单（`dsh.client`）

客户端包通过两个声明加入 Web 客户端表：

- `package.json` 里声明 `dsh.client`（`platform: 'web'`，可选 `inject` 边、可选 `immediately`）；
- 用 `exports["./client"]` 导出**已构建**的 bundle。

`dsh.client.inject` 里写的是**包行（package rows）**，不是 cordis 服务名 —— 官方注释原文：
*"`inject` names package rows whose ... uses the same package edges to compose entries."*；
而 cordis 服务注入走客户端入口自己的 `export const inject = [...]`。本插件两者都已正确声明。

### 2.3 peer 与 dev 双声明

> "Declare dsh packages whose instances the plugin must share with the host under both
> `peerDependencies` and `devDependencies`, as the harness packages do."

`peerDependencies` 保证运行时与宿主共用同一实例；`devDependencies` 供本地类型检查与测试。
**但这一条与第 3 节的现实冲突**，见下。

### 2.4 分发三条路，以及 git 安装的构建陷阱

| 方式 | 命令 | 用户是否需要额外授权 |
| --- | --- | --- |
| 发到 npm（推荐） | `dsh plugin add <包名>` | **不需要**，装的是预构建产物 |
| 发 tarball | `npm pack` → `dsh plugin add ./x-0.1.0.tgz` | **不需要** |
| 直接从 git 装 | `dsh plugin add github:you/repo` | **需要**：git 装的是源码，只有 `prepare` 会被执行来构建；pnpm ≥10 默认拒绝执行 git 依赖的 `prepare`，用户必须把包名加进 profile 的 `pnpm-workspace.yaml` 的 `allowBuilds` 并重试 |

官方对 git 安装的警告原文要点：把 `allowBuilds` 视为**授权该包在你机器上于安装期执行代码**，且应钉住
commit（`github:you/repo#<sha>`）。**若不想让用户授权，就分发构建产物。**

本插件三条路都支持：已配 `prepare`（= `tsdown`，构建自包含）与 `prepublishOnly`（构建 + 冒烟）。

---

## 3. 生态现实：两个致命坑，以及本插件的规避方式

来源：社区目录 dshbase 的审计页 <https://dshbase.com/zh/audit/>（已抓取）。其 2026 年 8 月批次全量验证结果里，
**安装失败 159 条**的构成是：

| 条数 | 失败原因 |
| --- | --- |
| **68** | 声明的依赖版本在 registry 上不存在 |
| **63** | 构建 / `prepare` 脚本失败（常因依赖了**未发布的 `@deepseek-ai/*` 包**） |
| 15 | 依赖包或仓库返回 404 |
| 13 | 不支持的依赖结构（workspace / linked / exotic） |

### 3.1 实测：`@deepseek-ai/*` 在 npm 上只有占位版

我在本机联网查询（`npm view`，2026-10-09）：

| 包 | npm 上的 version |
| --- | --- |
| `@deepseek-ai/dsh-client-ui-subagent` | `0.0.1-rc.1` |
| `@deepseek-ai/dsh-client-ui-slots` | `0.0.1-rc.1` |
| `@deepseek-ai/dsh-subagent` | `0.0.1-rc.1` |
| `@deepseek-ai/dsh-client-ui-primitives` | `0.0.1-rc.1` |
| `@deepseek-ai/cordis` | `4.0.4` |

而本机运行的 DSH 是 `0.2.1-alpha.1`。**也就是说：写 `"@deepseek-ai/dsh-subagent": "^0.1.7-rc.1"`
这类范围，在 registry 上根本不存在对应版本 —— 正是上面那 68 条的成因。**

### 3.2 本插件的三条规避

1. **`peerDependencies` 里 `@deepseek-ai/*` 用 `*`**（宿主的安装提供真实实例），避免「版本不存在」。
2. **`devDependencies` 只列真正发布在 npm 上的包**：`tsdown`、`lightningcss`、`typescript`、
   `react`、`react-dom`、`@types/react`、`@types/react-dom`、`jsdom`、`@testing-library/react`。
   **不把 `@deepseek-ai/*` 放进 devDependencies**，因此干净环境 `npm install` 不会失败。
3. **构建只需 `tsdown` + `lightningcss`，不解析任何 `@deepseek-ai/*`**（它们在 bundle 里是 external）。
   这一点我已**实证**：把 `node_modules/@deepseek-ai`、`react`、`react-dom` 全部移开后，
   `tsdown` 依然成功产出 `lib/index.js` 与 `lib/client/index.js`。

   > 代价：`npm run typecheck` 需要 `@deepseek-ai/*` 的类型，因此它只在「有 harness checkout 或已安装
   > 宿主依赖」的环境里可跑。`prepare` / `prepublishOnly` **刻意不包含 typecheck**，只做构建与冒烟。
   > 这是与官方 2.3 节建议的有意偏离，理由就是上面的 63 条失败。

---

## 4. 逐步操作

```bash
# 0) 填元数据：把 package.json 里三处 CHANGE-ME 换成你的真实仓库地址
# 1) 本地全绿（类型检查 → 构建 → 15 项 jsdom 冒烟）
npm install
npm run check

# 2) 干跑打包，核对将被发布的文件清单（files 白名单）
npm pack --dry-run

# 3) 发布（prepare / prepublishOnly 会在发布前自动构建）
npm publish --access public

# 4) 在一个干净 profile 里验证真实安装路径
dsh plugin --profile demo add dsh-plugin-subagent-model-route
dsh --profile demo --dump-config | grep -A3 subagent-model-route   # 确认层已应用
dsh --profile demo            # 启动，然后打开 Web GUI 看两个面
#   5) 验证完成后：dsh plugin --profile demo remove dsh-plugin-subagent-model-route
```

**「干净 profile 验证」不能跳过**：本机当前是 `link:` 挂载 + 依赖 shim，与用户从 npm 安装的路径不同。

### 4.1 `npm pack --dry-run` 应当包含

```
lib/index.js                     宿主半包（ESM，空 apply）
lib/client/index.js              客户端产物（闭包工厂 CJS）
cordis.patch.yml                 补丁层（插入本插件行）
README.md / README.zh.md         说明（npm 页面显示 README.md）
PUBLISHING.md / CHANGELOG.md
docs/*.png                       两张效果截图（供 README 引用）
LICENSE                          npm 自动包含
```

**不应包含** `node_modules/`、`src/`、`scripts/`、`tsdown.config.ts`、`UPSTREAM-PATCH*.patch`（后者不在
`files` 白名单里，属开发资料）。

---

## 5. 打包前自检清单

- [ ] `private` 已移除（否则 npm 拒绝发布）
- [ ] `repository` / `homepage` / `bugs` 不再是 `CHANGE-ME`
- [ ] `LICENSE` 存在且 `license` 字段一致（目录会标注缺失许可证的插件为风险项）
- [ ] `cordis.patch.yml` 里的 `name:` 与新包名一致
- [ ] `dsh.client.platform === 'web'`，且 `exports["./client"]` 指向存在的产物
- [ ] 客户端 bundle 的 `require` 集合只含平台种子模块（`npm run smoke` 会断言这一点）
- [ ] `lib/` 已构建且进入 tarball
- [ ] 版本号与 `CHANGELOG.md` 同步

---

## 6. 让插件被发现

DSH 生态里可被检索的来源（本机 `find_dsh_plugins` 实测到的目录集合）：

| 目录 | 规模 | 说明 |
| --- | --- | --- |
| dsh.works | ~17.7k 条 | 记录每个条目的安装路径与「核对于哪个 dsh 版本」 |
| dsh.so | ~9.6k 条 | 带验证级别与安全扫描，风险项（缺许可证、`prepare` 脚本、无锁文件等）会标注 |
| awesome-dsh-plugin | ~4.5k 条 | 社区 awesome 列表 |
| 岚叔目录 | ~655 条 | 中文社区目录 |
| npm | — | 按包名/keywords 搜索 |
| GitHub `dsh-plugin` topic | — | 官方 CONTRIBUTING 明确推荐社区插件打这个 topic 以便被发现 |

**dshbase** 采用提交 Issue 收录（其审计页给出的入口）：
<https://github.com/ylwl1997/dshbase/issues/new?template=plugin-submission.yml>

**awesome 列表**类目录通常用 PR 收录，各仓库规则不同，请按各自 CONTRIBUTING 核对：
- <https://github.com/dshworks/awesome-dsh-plugins/blob/main/CONTRIBUTING.md>
- <https://github.com/billLiao/awesome-dsh-plugin/blob/main/CONTRIBUTING.md>
- <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md>

> **标注（未完整核实）**：这几个 CONTRIBUTING 的具体提交格式我在本机未能抓取成功（fetch 失败），
> 上面只给链接，请以仓库当前内容为准。

### 6.1 dshbase 的验证级别（决定你要做到哪一步）

- **L1 安装** —— 在干净 profile 里、与固定版本 DSH 一起安装成功。
- **L2 加载** —— profile 启动并导出配置成功。
- **L3 Headless** —— 载入插件后跑 headless 问答；**若判定为 pure-Web，L3 不算通过**。
- **L4 Web CDP** —— L3 为 web-only 时必须再过：启动 Web profile + 浏览器 CDP 问答。**只有过 L4 才标「已验证」。**

**本插件是纯客户端插件（宿主 `apply` 为空、只贡献 Web UI occupant），因此必然被判为 web-only，
必须过 L4 才能拿到「已验证」。** 代码里无法自证这一点，只能靠提交后的审计方实测。

---

## 7. 版本与兼容性

- `dsh.compatibility.dshReleases` 记录「核对于哪个 dsh 版本」。当前为 `0.2.1-alpha.1`（本机实测版本）。
  **每次发布前用当时实测的 DSH 版本更新此表**，这是目录展示兼容性的依据。
- `engines.node` 与 `dsh.compatibility.node` 均为 `>=20`。
- 上游 UI 变更后的维护：见 README「维护」一节与 [PATCH-RECORD.md](./PATCH-RECORD.md)。
  由于本插件遮蔽官方 UI，**上游改动不会自动进入**，每次都要重新 vendor。

---

## 8. 已知陷阱速查

| 陷阱 | 表现 | 规避 |
| --- | --- | --- |
| 依赖版本在 registry 上不存在 | 安装失败（占失败榜首 68 条） | `@deepseek-ai/*` 一律用 `*`；devDeps 只列真实发布的包 |
| `prepare` 构建依赖未发布的包 | 构建失败（63 条） | 构建只需 tsdown + lightningcss（已实证自包含） |
| git 安装被 pnpm 拒绝 | 首次 `add` 失败并提示 `allowBuilds` | 优先发 npm / tarball，或文档写明授权步骤 |
| `lib/` 未打包 | 加载失败，报找不到入口 | `files` 含 `lib`；`prepare`/`prepublishOnly` 构建 |
| patch 文件路径错 | 加载失败 `ENOENT` | `dsh.bundle.patch` 指向存在的 `cordis.patch.yml` |
| `cordis.patch.yml` 里 name 与包名不一致 | 行无法解析 | 两处必须完全一致 |
| 客户端 bundle 请求了模块表以外的 `require` | 运行时必抛 | 保持 `dsh.client.inject`/平台种子范围；`npm run smoke` 已断言 |
| 缺许可证 / 无 manifest | 目录标注风险，甚至不上架 | 保留 LICENSE；确保 `dsh.bundle` 存在 |
| 遮蔽官方 UI 却未记录 | 上游更新后行为漂移无人知 | 维护 PATCH-RECORD.md，每次 re-vendor 更新基线版本 |
