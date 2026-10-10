/**
 * Render this plugin's two surfaces from the real built bundle into a standalone
 * HTML file, so the badge layout can be reviewed in a browser without booting the
 * harness.
 *
 * It runs the shipped artifact through the real `window.__ModuleLoader__` handoff
 * under jsdom, captures the CSS the bundle injects, and pairs it with the harness
 * theme's own token sheet — the preview therefore uses the same markup, class map
 * and CSS variables the Web client does.
 *
 *   node scripts/preview.mjs        ->  preview.html
 *   DSH_THEME_CSS=/path/to.css node scripts/preview.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '..')
const ANCHOR = process.env.DSH_ANCHOR ?? `${PLUGIN}/package.json`
const hostRequire = createRequire(ANCHOR)

// ---------------------------------------------------------------- environment
const { JSDOM } = hostRequire('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const key of [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'MouseEvent',
]) {
  if (dom.window[key] === undefined) continue
  try {
    globalThis[key] = dom.window[key]
  } catch {
    try {
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true })
    } catch { /* keep the Node-native global */ }
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --------------------------------------------------- module-loader handoff
let handoff
dom.window.__ModuleLoader__ = { load: (spec) => { handoff = spec } }
new Function('window', 'document', readFileSync(resolve(PLUGIN, 'lib/client/index.js'), 'utf8'))(dom.window, dom.window.document)
assert.ok(handoff, 'the bundle never called window.__ModuleLoader__.load')

const React = hostRequire('react')
const table = {
  'react': React,
  'react/jsx-runtime': hostRequire('react/jsx-runtime'),
  'react-dom': hostRequire('react-dom'),
  '@deepseek-ai/dsh-client-ui-primitives': {
    IconChevronDownOutlineRegular: (props) => React.createElement('svg', props),
    IconChevronRightOutlineRegular: (props) => React.createElement('svg', props),
    IconRefreshOutlineRegular: (props) => React.createElement('svg', props),
    StateDot: (props) => React.createElement('span', { 'data-state': props.state }),
    Tooltip: ({ label, children }) => React.createElement('span', { title: label }, children),
  },
}
const plugin = handoff.factory((id) => {
  if (id in table) return table[id]
  throw new Error(`bundle required "${id}", which is not a platform module row`)
})

const registrations = []
let dictionaries
plugin.apply({
  effect: (factory) => factory(),
  locale: { register: (ns, dict) => { dictionaries = { ns, dict } } },
  slots: {
    inject: (_key, factory) => factory(),
    register: (options, component) => registrations.push({ options, component }),
  },
  uiWorkspace: { openSession: () => {} },
  sidebarRight: { openResource: () => {} },
  sessions: { refreshProjections: () => Promise.resolve() },
})

const t = (key, params) => {
  const raw = dictionaries.dict.zh[key] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}
const lineageSlot = registrations.find((r) => r.options.name === 'conversation.session.header.lineage')
const actionsSlot = registrations.find((r) => r.options.name === 'conversation.session.header.actions')
assert.ok(lineageSlot && actionsSlot, 'both seats must be claimed')

// ------------------------------------------------------------------ fixtures
const PARENT = 'parent'
const route = (provider, model, reasoningEffort) => (reasoningEffort === undefined
  ? { provider, model }
  : { provider, model, reasoningEffort })

const children = [
  {
    id: 'child-a', label: '检查依赖升级', title: '检查依赖升级：核对版本范围与锁文件',
    mode: 'continuable', activity: 'running',
    route: route('openai', 'gpt-6-astra', 'high'), tokens: 14200, ms: 6000,
  },
  {
    id: 'child-b', label: 'da5cd27f-…', title: '计算 12*12，只输出符合 schema 的 JSON',
    mode: 'one-shot', activity: 'inactive',
    route: route('deepseek-official', 'deepseek-flash', 'high'), tokens: 13800, ms: 6000,
  },
  {
    id: 'child-c', label: '计算 12*12', title: '用不超过40个汉字说明 Python 里 list 与 tuple 的区别',
    mode: 'one-shot', activity: 'inactive',
    route: route('qwen', 'qwen3-coder-flash'), tokens: 13600, ms: 1000,
  },
  {
    id: 'child-d', label: '只输出一个词：CONTROL', title: '只输出一个词：CONTROL',
    mode: 'one-shot', activity: 'inactive',
    route: route('openai', 'gpt-5.6-sol', 'medium'), tokens: 12300, ms: 0,
  },
  {
    id: 'child-e', label: '从未发出请求', title: '这个子代理还没有发出过请求',
    mode: 'one-shot', activity: 'inactive',
    route: undefined, tokens: undefined, ms: undefined,
  },
]

const byId = Object.fromEntries(children.map((c) => [c.id, {
  id: c.id,
  displayTitle: c.label,
  title: c.title,
  running: c.activity === 'running',
  retainedBy: {},
  blank: false,
  updatedAt: 1,
  parentId: PARENT,
  origin: 'subagent',
  projectionValues: {
    ...c.route === undefined ? {} : { modelSelection: { lastUsed: c.route, next: c.route } },
    ...c.tokens === undefined ? {} : {
      tokenUsage: { uncachedInputTokens: c.tokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
    ...c.ms === undefined ? {} : { subagentTiming: { settledMs: c.ms, lastTurnCompleted: true } },
  },
}]))
const state = {
  ids: children.map((c) => c.id),
  byId,
  phase: 'ready',
  projectionsBySession: {
    [PARENT]: {
      state: 'ready',
      error: null,
      values: { subagentCatalog: children.map((c) => ({ id: c.id, mode: c.mode, label: c.label, createdAt: 1 })) },
    },
  },
}
const statuses = new Map([['child-a', { running: true }]])
const useSessions = (select) => select(state)
const useSessionStatus = (select) => select(statuses)
const useSession = (select) => select({
  subagent: { address: { parentSessionId: PARENT, childSessionId: 'child-a', mode: 'continuable' } },
})
const injected = { openChild: () => {}, openChildAside: () => {}, refreshProjection: () => {} }

// --------------------------------------------------- surface 1: catalog rows
const { render, cleanup, fireEvent, screen } = hostRequire('@testing-library/react')
render(React.createElement(actionsSlot.component, {
  sessionId: PARENT, useSessions, useSessionStatus, t, ...injected,
}))
fireEvent.click(screen.getByRole('button', { name: /个子智能体/ }))
const tree = document.querySelector('[role="tree"]')
assert.ok(tree, 'the catalog tree did not render')
const rowsMarkup = tree.innerHTML
cleanup()

// ------------------------------------------------- surface 2: child header
const header = render(React.createElement(lineageSlot.component, {
  lineageSessionId: 'child-a',
  displayTitle: '检查依赖升级',
  useSessions, useSession, useSessionStatus, t, ...injected,
}))
const chipMarkup = header.container.innerHTML
cleanup()

// ------------------------------------------------------------- assemble page
const pluginCss = [...dom.window.document.querySelectorAll('style[data-plugin-css]')]
  .map((node) => node.textContent ?? '')
  .join('\n')
const themePath = process.env.DSH_THEME_CSS
  ?? '/home/huhu233/otherProject/deepseek-harness/packages/client/ui-theme/src/styles/design-platform.css'
const themeCss = existsSync(themePath) ? readFileSync(themePath, 'utf8') : ''

const version = JSON.parse(readFileSync(resolve(PLUGIN, 'package.json'), 'utf8')).version
const page = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>dsh-plugin-subagent-model-route ${version} — preview</title>
<style>${themeCss}</style>
<style>${pluginCss}</style>
<style>
  body {
    margin: 0; padding: 26px 30px 60px;
    background: var(--dsw-static-neutral-bluish-50, #f6f7f9);
    color: var(--dsw-alias-label-primary, #1d1e20);
    font-family: var(--dsw-font-family, -apple-system, 'Segoe UI', 'PingFang SC', sans-serif);
  }
  h1 { font-size: 15px; margin: 0 0 6px; font-weight: 600; }
  h2 { font-size: 13px; margin: 28px 0 4px; font-weight: 600; }
  .note { font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-tertiary, #8a8f98); margin: 0 0 10px; max-width: 720px; }
  code { font-family: var(--ds-font-family-code, monospace); font-size: 11px; }
  .menu-card {
    width: 336px; padding: 6px; box-sizing: border-box;
    background: var(--dsw-specific-menu, #fff);
    border: 1px solid var(--dsw-alias-border-l1, #e6e8eb);
    border-radius: var(--dsw-radius-lg, 12px);
    box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0,0,0,.10));
  }
  .header-bar {
    display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px;
    background: var(--dsw-specific-menu, #fff);
    border: 1px solid var(--dsw-alias-border-l1, #e6e8eb);
    border-radius: var(--dsw-radius-lg, 12px);
  }
</style>
</head>
<body>
  <h1>dsh-plugin-subagent-model-route ${version} — 渲染预览</h1>
  <p class="note">
    以下标记与样式全部来自<strong>真实构建产物</strong>（<code>lib/client/index.js</code>）：走真实的
    <code>window.__ModuleLoader__</code> 交接、真实的 lightningcss 类名映射，并叠加 harness 主题自己的
    <code>design-platform.css</code> 变量表，因此在浏览器里打开所见即线上观感。
    预览数据是构造的（provider / effort / 无请求 各一例）。
  </p>

  <h2>① 父会话目录行（下拉宽度 336px）</h2>
  <p class="note">
    每行三行堆叠：名称 / 徽标行（mode · 活动状态 · <strong>provider/model · effort</strong>）/ 标题。
    第 2 行的 <code>deepseek-official/deepseek-flash · high</code> 是最长的一例，若徽标行放不下会整体换到第二行而不是被裁切。
  </p>
  <div class="menu-card">${rowsMarkup}</div>

  <h2>② 子代理会话页头</h2>
  <p class="note">面包屑切换器右侧的路由 chip，同样是 <code>provider/model · effort</code>。</p>
  <div class="header-bar">${chipMarkup}</div>
</body>
</html>
`

const out = resolve(PLUGIN, 'preview.html')
writeFileSync(out, page, 'utf8')
console.log(`preview: wrote ${out}`)
console.log(`  rows          : ${children.length}`)
console.log(`  plugin css    : ${pluginCss.length} bytes`)
console.log(`  theme css     : ${themeCss.length} bytes${themeCss === '' ? ' (missing — colors fall back)' : ''}`)
