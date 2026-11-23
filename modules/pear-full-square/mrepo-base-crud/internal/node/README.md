# node

A node as it is stored, and the nodes a request's URI selects.

Every node is a folder holding its document, `.node.json`: `{}` when no
value was given. The name starts with a dot, so no URI can name it, and
it keeps the folder in git. `main/swarms/swarm-1` is
`swarms/swarm-1/.node.json` in `main`.

## Signature

- `place(uri)`: where a request's URI, its segments, points.
- `nodeAt(exec, place, names)`: the node at those names below the layer.
- `select(exec, place)`: what the URI selects, through the mrepo's query
  (`mrepo-base-xpath`).

## Returns

- `place`: `{ segments, layer, names, uriOf(names), at(names) }`. `names`:
  the names below the layer when the URI names one node; `null` when it
  selects (a `*` or a filter in it). `uriOf` gives a node's URI in the
  request's own format, its prefix kept.
- `nodeAt`: `{ uri, value, children }`, with `shortcuts` where the node
  is a link; `null` when there is none. The layer itself is a node.
- `select`: `[{ names, node }]`, empty when nothing is there: each node
  as `nodeAt` gives it; a value inside a document as `{ uri, value }`,
  marked `value: true` beside it; a file as `{ uri, value }`, its value
  the file's document, marked `file: true`. A folder without a document
  is not among them.

## Errors

- The URI is the mrepo itself, above its layers.
- In `main`, a URI that runs through a shortcut, or filters one.

## Design

- A node's children are the folders in it that hold a document. A hidden
  folder, or one without, is none.
- Paths are written relative, from the mrepo's root.

## Also exported

`NODE`: `.node.json`. `folderOf(place, names)`: a node's folder.
`inside(exec, place, names)`: the check against a URI through a shortcut.
