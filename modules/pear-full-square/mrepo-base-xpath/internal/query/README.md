# query

Resolves a request's URI to what it selects in this mrepo, each a reference, and says where it stopped at a shortcut.

The URI is a query: plain names, `*`, filters. It is read by
`mycelium-xpath`, which says what of XPath is built. This method hands
it the mrepo as a tree: what a node's document is, what is hidden, where
a shortcut is.

## Signature

`query(exec, uri)`: `exec` reads the mrepo (`node`, `children`, `bytes`)
and measures (`step`); `uri` is its segments as a request's form holds
it, the layer first in what they make together: `["main",
"swarms/*[state='started']"]`, `["runtime/hooks"]`.

## Returns

`{ layer, found, stopped }`.

- `found`: what the URI selects, in the tree's order, each
  `{ at, kind, ... }`. `at` is its position as written at the layer, `.`
  the layer itself. `kind` says what it is:
  - `node`: a folder holding its document (`.node.json`), or the layer;
    `node` is the tree's own. With `shortcut` when it is one.
  - `folder`: a folder without a document.
  - `file`: a file.
  - `value`: something inside a document; `value` is it.
- `stopped`: where the URI runs through a shortcut, each
  `{ at, rest, shortcut }`: `rest` is what is left of the URI, a URI for
  the mrepo linked there; `shortcut` as `linkOf` gives it.

Nothing there, or no such layer: `found` is empty.

## Errors

- The URI is not an array of segments, or a segment is not canonical.
- The URI is the mrepo itself (`.`), or its layer carries a filter.
- A document that does not parse; what `mycelium-xpath` refuses.

## Design

- **The tree.** A folder's children are what is not hidden in it: a name
  starting with a dot is no URI's. A folder's document is its
  `.node.json`; a file's is the file, JSON, or its text when it is not.
- **A shortcut stops it.** In `main`, a position with sources is a link
  to elsewhere: its children and its document are in the mrepo linked
  there. One source is in use for now, the first.
- **Nothing read that is not asked.** What is found is references. A
  folder's listing is asked once a query.
- **Measured by the context**: the whole as `query`, each round of it as
  `segment` or `filter`, steps of the action that called.

## Also exported

- `NODE`: `.node.json`, the name a node's document is stored under.
