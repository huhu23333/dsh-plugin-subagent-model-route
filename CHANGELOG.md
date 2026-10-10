# Changelog

## 0.1.2

Show the whole route in both surfaces. The catalog badge and the child-session header chip now
read `provider/model · reasoningEffort` instead of the bare model id, so the provider and the
effort are legible without hovering. A route long enough to outgrow the badge line wraps onto
its own line rather than being clipped.

- `SubagentHeaderLineage.tsx`: both readouts render `modelRoute(model)`.
- `SubagentHeaderLineage.module.css`: the badge line wraps (`flex-wrap`) for long routes, and
  the child-session chip's cap doubles (180px → 360px) so the longer route is not ellipsized.
- The tooltip still repeats the route under its label.

## 0.1.1

Fix a bare `npm install dsh-plugin-subagent-model-route` failure. `react` and `react-dom`
were declared as *required* peers, so npm v7+ auto-installed them and resolved
`react-dom@19` against `react@18`, ending in `ERESOLVE`. Every peer this plugin declares is
provided by the host at runtime, so all of them are now `optional`: a plain install resolves
to this package alone, and no longer drags in the harness packages or a second React.

- `package.json`: `peerDependenciesMeta` now marks `react` and `react-dom` optional as well,
  alongside the existing `@deepseek-ai/*` entries.
- No runtime change; the module-table `require` set is unchanged.

## 0.1.0

Initial release. Shadows the shipped subagent catalog UI at `priority: -1` to add the model
route readout to both surfaces:

- **Catalog rows** — the row stacks three lines (name, a mode/activity/model badge line, and
  the durable title), so an over-long title can no longer ellipsize the route away.
- **Child session header** — the route renders beside the breadcrumb switcher; root sessions
  still render nothing in that seat.

Route data comes from the existing durable `modelSelection` projection: no RPC, no host
change, no new projection. Vendored from `@deepseek-ai/dsh-client-ui-subagent` at
`deepseek-ai/deepseek-harness` `master @ 5badb15009` plus the two modifications recorded in
[PATCH-RECORD.md](./PATCH-RECORD.md).
