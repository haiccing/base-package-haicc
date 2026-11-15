// mrepo-base-xpath: its documented methods, a directory each (README.md beside each).
//   internal/   query: a request's URI resolved to what it selects, and
//               where it stopped at a shortcut; with it NODE
//               shortcut: where a node's sources are recorded and where
//               they lead: shortcutOf, shortcutsAt, linkOf, shadowOf,
//               swarmOf, uriOf, IDENTITY, SHORTCUTS, MAIN
export { query, NODE } from './internal/query/index.js'
export { shortcutOf, shortcutsAt, linkOf, shadowOf, swarmOf, uriOf, IDENTITY, SHORTCUTS, MAIN } from './internal/shortcut/index.js'
