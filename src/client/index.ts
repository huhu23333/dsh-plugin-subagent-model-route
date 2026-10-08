/**
 * Subagent Model Route — client half.
 *
 * Takes over the two shipped catalog surfaces by priority so every row and every
 * child header can name the model route the child actually ran on. The vendored
 * renderer below is the shipped one plus that single feature; the shipped
 * occupants stay registered and are shadowed, never unregistered.
 *
 * Why shadowing rather than an additive seat: `conversation.session.header.lineage`
 * is a `single` cell with no `registerOptions` and no declared children, and
 * `conversation.session.header.actions` addresses its catalog trigger by the id
 * `subagent-catalog`. The slot registry throws when a second registration lands on
 * an occupied cell at the SAME priority and shadows it at a different one, so
 * `SHADOW_PRIORITY` is what makes both takeovers legal.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SubagentAddress } from '@deepseek-ai/dsh-subagent/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  SubagentCatalogAction, SubagentHeaderLineage, type SubagentCatalogInjected,
} from './SubagentHeaderLineage.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { en, NS, zh, type SubagentKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Subagent catalog copy plus the model-route readout. */
    'subagentModelRoute': SubagentKey
  }
}

export type {
  SubagentCatalogInjected, SubagentHeaderLineageProps,
} from './SubagentHeaderLineage.tsx'

/** Required services for the two seized seats and the catalog navigation they need. */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale', 'sidebarRight']

/** The shipped Sidebar chat resource the row's trailing arrow opens. */
const SUBAGENT_CHAT_ADDRESS = 'dsh-resource://subagentchat/session/'

/**
 * Canonical Sidebar chat address for one child, mirroring the resource the
 * shipped package registers.
 * @param address - the child's exact catalog address.
 * @returns the encoded resource URL.
 */
function subagentChatAddress(address: SubagentAddress): string {
  const query = new URLSearchParams({
    parent: address.parentSessionId,
    mode: address.mode,
  })
  return `${SUBAGENT_CHAT_ADDRESS}${encodeURIComponent(address.childSessionId)}?${query}`
}

/**
 * Renders below both shipped occupants, which register at the default priority 0:
 * the registry rejects a second registration at an occupied cell's exact priority
 * and shadows on any lower one.
 */
const SHADOW_PRIORITY = -1

/**
 * Client plugin body: claim the catalog trigger cell and the lineage seat.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'subagent-model-route: dictionaries')
  const catalogActions = (_parentSessionId: SessionId): SubagentCatalogInjected => ({
    openChild(address: SubagentAddress) {
      ctx.uiWorkspace.openSession(address)
    },
    openChildAside(address: SubagentAddress) {
      ctx.sidebarRight.openResource(subagentChatAddress(address), {
        kind: 'subagentchat',
        preferNewPane: true,
      })
    },
    refreshProjection(parentSessionId: SessionId) {
      void ctx.sessions.refreshProjections(parentSessionId)
    },
  })
  // Child sessions: breadcrumb switcher plus the route readout beside it.
  ctx.slots.inject(
    'conversation.session.header.lineage',
    () => ctx.slots.register({
      name: 'conversation.session.header.lineage',
      priority: SHADOW_PRIORITY,
      locale: NS,
      inject: catalogActions,
    }, SubagentHeaderLineage),
  )
  // Root sessions: the descendant-count trigger and its routed tree.
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'subagent-catalog',
      order: -30,
      priority: SHADOW_PRIORITY,
      locale: NS,
      inject: catalogActions,
    }, SubagentCatalogAction),
  )
}
