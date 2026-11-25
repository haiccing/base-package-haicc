# query

Resolves a request's URI to what it selects in this mrepo, each a reference, and says where it stopped at a shortcut.

The URI is a query: plain names, `*`, filters. It is read by
`mycelium-xpath`, which says what of XPath is built. This method hands
it the mrepo as a tree: what a node's document is, what is hidden, where
a shortcut is.

## The result

`query(exec, uri, { mode, ascending })` is the one way an mrepo is
queried: it hands back the URI's result, to be iterated
(`mycelium-xpath`'s `XPathResult` and its `XPathIterator` under it).
There is no second form that answers everything at once: who wants all
of it reads the result to its end.

- `iterateNext()`: the next reference (`{ at, kind, node | value,
  shortcut? }`, `at` its logical address), `null` at the end;
  `take(n)`; `all()`, what is left.
- `stopped()`: where it stopped at a shortcut so far. `metadata()`: the
  result's, the logical query and its physical translation. `layer`.
- Its slices are fetched as the reading needs them, each in the
  request's log (`batch`); a reader that takes a few and stops costs
  the slices that took. The query itself is logged when its result is
  made (`query`: its URI, how it is read).
- `ascending`: a topic read from its earliest on, in the order its
  records arrived (an inbox after its pointer); when not said, from its
  latest back.

## The node set

A query answers a node set (`mycelium-xpath`): logical, the request and
its storage's structure type; its data loaded a batch at a time, each by
a physical query from `mycelium-xpath-physical`, executed on the tree as
it is stored and reported through the execution's step (`batch`: the
logical query, from where, the physical query, how many came). A layer
says its structure type in its `.layer.json` (`structure`); none: a
plain tree (`tree`), its one physical query the logical one. Read to
its end by who wants all of it; `metadata()` says the result as data.

`mode`: `physical` (when none is passed: what a command that
writes addresses) reads the
layer as it is stored. `logical` reads a topic as its records: the
layer itself, or the first of the URI's plain leading names whose
folder says a structure of records (`offset-files`); its node set fixed
by the topic's latest offset now (one physical query, logged as a batch
is, `fixes: true`), its batches from that structure's generator, the
latest first; each found at its address, `<topic>/*[@offset=<offset>]`
and what was asked after it. What is no topic reads the same either
way.

## Signature

`query(exec, uri, { mode, ascending })`: `exec` reads the mrepo (`node`, `children`, `bytes`)
and measures (`step`); `uri` is its segments as a request's form holds
it, the layer first in what they make together: `["main",
"swarms/*[state='started']"]`, `["runtime/hooks"]`.

## Returns

The result (above). Iterated:

- each reference: what the URI selects, in the tree's order,
  `{ at, kind, ... }`. `at` is its position as written at the layer, `.`
  the layer itself. `kind` says what it is:
  - `node`: a folder holding its document (`.node.json`), or the layer;
    `node` is the tree's own. With `shortcut` when it is one.
  - `folder`: a folder without a document.
  - `file`: a file.
  - `value`: something inside a document; `value` is it.
- `stopped()`: where the URI runs through a shortcut, each
  `{ at, rest, shortcut }`: `rest` is what is left of the URI, a URI for
  the mrepo linked there; `shortcut` as `linkOf` gives it.

Nothing there, or no such layer: nothing to iterate.

## Errors

- The URI is not an array of segments, or a segment is not canonical.
- The URI is the mrepo itself (`.`), or its layer carries a filter.
- A document that does not parse; what `mycelium-xpath` refuses.

## Design

- **The tree.** A folder's children are what is not hidden in it: a name
  starting with a dot is no URI's. That is the one rule: a node's
  document (`.node.json`), its shortcuts (`.shortcuts.json`) and a
  layer's own config (`.layer.json`) are hidden by their names, none
  singled out. A folder's document is its
  `.node.json`; a file's is the file, JSON, or its text when it is not.
- **A data name in its URI form.** A document's key is written in a URI
  as the rules say, each capital as `-` and the letter in lowercase:
  `publicKey` is `public-key`, as a step, in a filter
  (`*[owner/public-key='k1']`) and in the position of a value found.
- **A shortcut stops it.** In `main`, a position with sources is a link
  to elsewhere: its children and its document are in the mrepo linked
  there. One source is in use for now, the first.
- **Nothing read that is not asked.** What is found is references. A
  folder's listing is asked once a query.
- **Measured by the context**: the whole as `query`, each round of it as
  `segment` or `filter`, steps of the action that called.

## Also exported

- `NODE`: `.node.json`, the name a node's document is stored under.
