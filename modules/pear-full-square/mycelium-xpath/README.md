# mycelium-xpath

Navigate a tree by path, and query it. Generic: it knows no git. A tree is
reached only through `children(node)`, which returns a node's children as
`[name, child]` pairs, or `null` for a leaf. It may be async, as reading a
git tree is.

Paths are `/`-separated from the root, and valid: they are validated at
the boundary (`mycelium-uri`), not here. A `*` step matches every child.
Names match exactly.

## Links

- [lib](lib/)
- [test](test/)

## API

- `select(children, root, path, match?)` → every node matching `path`, as
  `[path, node]` pairs, in the order `children` gives them. A plain path
  gives zero or one pair; `/main/*/a` matches `a` in every child of `main`.
  `match(name, step)` replaces exact matching. Only the boundary passes
  one: `sameName` from `mycelium-uri`, to find the stored names of an
  external URI once. Inside, paths are stored names and match exactly
- `objectChildren(node)`: `children` for plain objects. An object is a
  folder; anything else is a leaf

- `query(tree, root, text)` → `{ found, stopped }`: a query, below

`select` and `query` are async. Plain, pure functions, not instrumented: a
run reproduces them from their arguments.

## A query

`query` reads standard XPath's forward part, in phases: what a query is,
what phase 1 holds and what is refused, is the base family's XPath
documentation (`haiccing/base-docs-xpath`). Here, what `query` is handed
and what it gives back.

The tree is handed in, `tree`:

- `children(node)`: as `select`'s
- `document(node, ref)`, optional: the node's document, a plain value, or
  `null` (`ref`: its reference, `{ path, node }`). It continues the tree below the node: a step that names no child
  is looked for among the document's keys, and goes on inside it. A
  list is a child that repeats, as XPath sees one: its key names every
  item, in order (`tags`), a position picks one (`tags[2]`), and an
  item's path says its position. A leaf in a filter is a key holding a
  value. A leaf of the tree has a value when its document is no object
- `stop(ref)`, optional: truthy where the query must not go on from a node,
  a link to elsewhere, whose children and document are there
- `match(name, step)`, optional: as `select`'s
- `name(key)`, optional: the name a document's key has in a query and in
  a path, where keys are written another way there (`publicKey` as
  `public-key`); the key itself by default
- `step(event, data, fn)`, optional: each round is run through it, for who
  calls to measure: `segment` (`{ steps, in, out }`) and `filter`
  (`{ filter, in, out }`), `data` a function of the round's result

What comes back:

- `found`: the nodes selected, as references: `{ path, node }`, the node as
  `children` gave it, nothing of it read; inside a document
  `{ path, value }`
- `stopped`: where it stopped with some of the query left:
  `{ path, node, rest, why }`. `why` is what `stop` said; `rest` is the
  query's text from there on, a query for who goes on elsewhere, from that
  node as its root. A filter on a node it stops at goes with it

How it is read, a segment, a filter, a document continuing the tree, a
position: the XPath documentation.

## The folders

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the unit tests
