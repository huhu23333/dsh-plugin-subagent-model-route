# Changelog

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
