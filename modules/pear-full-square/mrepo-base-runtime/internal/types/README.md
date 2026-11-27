# types

What a runtime checks by: the types its own mrepo holds, in its `avro` layer.

A runtime checks a record by the types in its own mrepo's `avro` layer,
`avro/types/<org>/<package>/<name>.avsc`, whichever mrepo it runs
(`base-docs-package`, `mrepo/avro/`). The three essential types are
there from the deploy, the runtime package's own. No folder outside the
mrepo is read, and no other mrepo.

## Signature

`typesOf(repo)`: the types of the mrepo whose repository this is, read
as its runtime starts.

## Returns

`{ held, type, valid }`:

- `held`: the URIs of the types it holds, sorted.
- `type(uri)`: the type of that name (`mycelium-avro`'s), made when
  first asked and kept; the types it refers to by name made first. One
  of AVRO's own, by its URI (`avro/string`, ...): a type every mrepo
  has, with no file in its layer and not in `held`.
- `valid(uri, value)`: the value checked against it, strictly:
  `{ valid: true }` or `{ valid: false, problems }`.

## Errors

- A name that is no URI of a type: `not a type's name: <name>`.
- A type the mrepo does not hold: `type not held: <URI>`, with where it
  would be.
- A type that refers to a name with no URI: said, with the type.

## Also exported

- `HELD`, `fileOf(uri)`: `/avro/types`, a type's file there.

## Design

- **Read once, at start**: a check is synchronous and reads nothing; a
  type never changes under its fingerprint.
- **A type not held is refused**: asking the schema registry for it,
  through the link in the layer, and keeping what it gives, is not
  built yet (`base-docs-vision`, "Type system").
- **A schema that fails leaves no name behind**: each is made beside
  what is known so far.
