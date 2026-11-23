// mrepo-base-xpath: its documented methods, a directory each (README.md beside each).
//   internal/   query: a request's URI resolved to what it selects, and
//               where it stopped at a shortcut; with it NODE
//               shortcut: where a node's sources are recorded and where
//               they lead (the links layer):
//               shortcutOf, shortcutsAt, linkOf, linked, linkPath,
//               swarmOf, namespaceOf, uriOf, IDENTITY, SHORTCUTS, LINKS,
//               LOCAL, NODE, MAIN
export { query } from './internal/query/index.js'
export { shortcutOf, shortcutsAt, linkOf, linked, linkPath, swarmOf, namespaceOf, uriOf, IDENTITY, SHORTCUTS, LINKS, LOCAL, NODE, MAIN } from './internal/shortcut/index.js'
