# read

Reads the nodes a URI selects: each with its document and the names of its children.

A URI names one node, or selects: it is a query (`xpath`, the docs mrepo's
keyword, says what of XPath is built). A `*` selects every child; a filter keeps the
nodes whose document it holds for: `swarms/*[state='started']`,
`swarms/*[size>2 and owner/name='ann']/nodes/*`. A leaf in a filter is a
key of the node's document, in its URI form: `publicKey` is written
`public-key`. Nothing there selects nothing: an empty
array, not an error.

## Logical and physical

A topic is read as its records, the latest first, each under its
address (`done/*[@offset=<offset>]`), nothing of how it is stored in
the answer: the reading when nothing is said.
`--flags physical` reads the layer as it is stored (`mrepo-base-xpath`,
`query`). The flag is the one way to switch. A layer that is a plain tree reads
the same either way.

## Signature

`read(exec, { uri })`: requested as `crud/read <URI>`.

## Returns

An array of nodes:

```
[{ "uri": ["main", "swarms"], "value": {}, "children": ["swarm-1"] }]
```

- `uri`: in the internal format, its segments.
- `children`: by name only; `crud/read swarms/*` reads them.
- `shortcuts`: only at a node that is a link: the mrepos its data comes
  from, `[{ "mrepo": "local/host" }]`.

The layer itself, `.` from outside, is a node: its document `{}` when it
has none.

A URI that goes on inside a node's document selects the value there:
`crud/read swarms/swarm-1/owner/name` gives `[{ "uri": [...], "value":
"ann" }]`.

A file is its own document, JSON or its text: `{ "uri": [...],
"value": ... }`. So the records of another layer are read:
`crud/read done/* --flags layer=request`. A folder without a document
is not among them, nor a layer's own config (`.layer.json` at its root).

A binary record, AVRO in its single-object encoding (`.avro`), is
decoded by the install's registry (`mycelium-value-avro`, its folder
beside the packages in the store the mrepo's packages manifest names),
every level in its place, as each was written: the record, its value,
what that carries (`unfold`); bytes that are no level of it as base64
text. A fingerprint the registry does not know is an error. A filter
reads JSON documents only.

## Errors

- A query that does not read.
- A URI that runs through a shortcut, a filter on one too: what is below
  one, and its document, is read in the mrepo it leads to, with a `haicc`
  at it.
