/**
 * Headless smoke test for the built client bundle.
 *
 * Runs the real artifact through the real module-loader handoff and renders both
 * seized seats with jsdom, so the plugin's wiring (priority takeovers) and the
 * model-route annotation are verified without a browser.
 *
 * Resolution is anchored at this package's own install by default, so the bundle
 * under test and the test renderer share ONE React instance (two copies break
 * hooks). DSH_ANCHOR overrides the anchor for a machine where the host-provided
 * packages only exist inside a harness checkout.
 *
 *   node scripts/smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = resolve(HERE, '..')
const ANCHOR = process.env.DSH_ANCHOR ?? `${PLUGIN}/package.json`
const hostRequire = createRequire(ANCHOR)

let checks = 0
const ok = (label) => {
  checks += 1
  console.log(`  ✓ ${label}`)
}

// ---------------------------------------------------------------- environment
const { JSDOM } = hostRequire('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true })
for (const key of [
  'window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'MutationObserver',
  'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'MouseEvent',
]) {
  if (dom.window[key] === undefined) continue
  // Some Node globals (navigator) are getter-only; fall back to redefining.
  try {
    globalThis[key] = dom.window[key]
  } catch {
    try {
      Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true })
    } catch {
      // Leave the Node-native global in place; jsdom content still has its own.
    }
  }
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

// --------------------------------------------------- module-loader handoff
let handoff
dom.window.__ModuleLoader__ = { load: (spec) => { handoff = spec } }
const bundle = readFileSync(resolve(PLUGIN, 'lib/client/index.js'), 'utf8')
new Function('window', 'document', bundle)(dom.window, dom.window.document)

assert.ok(handoff, 'the bundle never called window.__ModuleLoader__.load')
assert.equal(handoff.id, 'dsh-plugin-subagent-model-route')
ok('bundle hands off through window.__ModuleLoader__.load({ id, factory })')

// The injected require is the host module table: only platform seed rows resolve,
// so any other request is a hard failure here exactly as it would be in the browser.
const React = hostRequire('react')
const reactDom = hostRequire('react-dom')
const table = {
  'react': React,
  'react/jsx-runtime': hostRequire('react/jsx-runtime'),
  'react-dom': reactDom,
  '@deepseek-ai/dsh-client-ui-primitives': {
    IconChevronDownOutlineRegular: (props) => React.createElement('svg', props),
    IconChevronRightOutlineRegular: (props) => React.createElement('svg', props),
    IconRefreshOutlineRegular: (props) => React.createElement('svg', props),
    StateDot: (props) => React.createElement('span', { 'data-state': props.state }),
    Tooltip: ({ label, children }) => React.createElement('span', { title: label }, children),
  },
}
const requested = new Set()
const plugin = handoff.factory((id) => {
  requested.add(id)
  if (id in table) return table[id]
  throw new Error(`bundle required "${id}" — not a platform module row`)
})
ok(`factory resolved through the module table (${[...requested].length} rows, all platform seed)`)

// ------------------------------------------------------------- apply() wiring
const registrations = []
let dictionaries
const ctx = {
  effect: (factory) => factory(),
  locale: { register: (ns, dict) => { dictionaries = { ns, dict } } },
  slots: {
    inject: (_key, factory) => factory(),
    register: (options, component) => registrations.push({ options, component }),
  },
  uiWorkspace: { openSession: () => {} },
  sidebarRight: { openResource: () => {} },
  sessions: { refreshProjections: () => Promise.resolve() },
}
plugin.apply(ctx)

assert.deepEqual(plugin.inject, ['sessions', 'uiWorkspace', 'slots', 'locale', 'sidebarRight'])
ok('injects the services both seats need')
assert.equal(dictionaries.ns, 'subagentModelRoute')
ok('registers its own locale namespace (no clash with the shipped `subagent` one)')

const lineage = registrations.find((entry) => entry.options.name === 'conversation.session.header.lineage')
const actions = registrations.find((entry) => entry.options.name === 'conversation.session.header.actions')
assert.ok(lineage && actions, 'both catalog seats were claimed')
assert.equal(registrations.length, 2)
ok('claims exactly two seats: lineage (single) + the subagent-catalog list cell')
assert.equal(actions.options.id, 'subagent-catalog')
assert.equal(actions.options.order, -30)
ok('reuses the shipped `subagent-catalog` id to replace that cell in place')
// The registry rejects a second registration at an occupied cell's exact
// priority (default 0) and shadows on any lower one.
assert.equal(lineage.options.priority, -1)
assert.equal(actions.options.priority, -1)
ok('shadows at priority -1 (the shipped occupants own 0, where a retry would throw)')

// ------------------------------------------------------------------ fixtures
const PARENT = 'parent'
const CHILD = 'child'
const REVIEWER = 'reviewer'
const route = { provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'high' }
const summary = (id, extra) => ({
  id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 1, ...extra,
})
const byId = {
  [CHILD]: summary(CHILD, {
    title: '正在扫描项目文件',
    running: true,
    parentId: PARENT,
    origin: 'subagent',
    projectionValues: {
      modelSelection: { lastUsed: route, next: route },
      tokenUsage: {
        uncachedInputTokens: 1200, outputTokens: 340, cacheReadTokens: 0, cacheWriteTokens: 0,
      },
    },
  }),
  // A child that never issued a request carries no modelSelection.
  [REVIEWER]: summary(REVIEWER, { title: '检查依赖升级', parentId: PARENT, origin: 'subagent' }),
}
const state = {
  ids: [CHILD],
  byId,
  phase: 'ready',
  projectionsBySession: {
    [PARENT]: {
      state: 'ready',
      error: null,
      values: {
        subagentCatalog: [
          { id: CHILD, mode: 'continuable', label: 'worker', createdAt: 1 },
          { id: REVIEWER, mode: 'one-shot', label: 'reviewer', createdAt: 2 },
        ],
      },
    },
  },
}
const statuses = new Map([[CHILD, { running: true }]])
const useSessions = (select) => select(state)
const useSessionStatus = (select) => select(statuses)
const address = { parentSessionId: PARENT, childSessionId: CHILD, mode: 'continuable' }
const useSession = (select) => select({ subagent: { address } })

const t = (key, params) => {
  const raw = dictionaries.dict.zh[key] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}
const injected = { openChild: () => {}, openChildAside: () => {}, refreshProjection: () => {} }

// ----------------------------------------------- surface 1: the catalog rows
const { render, cleanup, fireEvent, screen } = hostRequire('@testing-library/react')
render(React.createElement(actions.component, {
  sessionId: PARENT, useSessions, useSessionStatus, t, ...injected,
}))
fireEvent.click(screen.getByRole('button', { name: /个子智能体/ }))
const rows = screen.getAllByRole('treeitem')
assert.equal(rows.length, 2)
ok('the count trigger opens the catalog tree with both rows')

const workerRow = rows.find((row) => row.textContent.includes('worker'))
const reviewerRow = rows.find((row) => row.textContent.includes('reviewer'))
assert.match(workerRow.textContent, /正在扫描项目文件/)
ok('row line 3 keeps the durable title (long summaries no longer squeeze the route out)')
assert.match(workerRow.textContent, /可继续/)
assert.match(workerRow.textContent, /正在运行/)
ok('row line 2 carries the mode and activity badges')
// The badge spells out the provider and the reasoning effort, not just the model id.
assert.match(workerRow.textContent, /openai\/gpt-6-astra · high/)
ok('row line 2 shows provider, model, and reasoning effort')
const badge = [...workerRow.querySelectorAll('span')].find((node) => node.textContent === 'openai/gpt-6-astra · high')
assert.ok(badge, 'the routed row shows its route on the badge line')
assert.equal(badge.getAttribute('title'), '实际使用模型：openai/gpt-6-astra · high')
ok('the route badge shows "openai/gpt-6-astra · high" and titles the same route')
assert.doesNotMatch(reviewerRow.textContent, /gpt-6-astra/)
ok('a child with no request history shows no route badge')
assert.match(workerRow.textContent, /1.5K tok/)
ok('the trailing usage column still renders beside it')
cleanup()

// ------------------------------------- surface 2: the child session's header
const lineageProps = {
  lineageSessionId: CHILD,
  displayTitle: 'worker',
  useSessions, useSession, useSessionStatus, t, ...injected,
}
const childHeader = render(React.createElement(lineage.component, lineageProps))
const chip = screen.getByText('openai/gpt-6-astra · high')
assert.equal(chip.getAttribute('title'), '实际使用模型：openai/gpt-6-astra · high')
ok("the child session's header shows the provider, model, and effort beside its breadcrumb switcher")
cleanup()

// Root sessions keep rendering nothing in this seat, exactly as shipped.
const rootHeader = render(React.createElement(lineage.component, {
  ...lineageProps, lineageSessionId: PARENT,
}))
assert.equal(rootHeader.container.innerHTML, '')
ok('a root session still renders nothing in the lineage seat')

console.log(`\nsmoke: ${checks} checks passed`)
