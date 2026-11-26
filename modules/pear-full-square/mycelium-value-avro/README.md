# mycelium-value-avro

An encoding as a handler: one value to bytes and back, as AVRO, its schema named by its fingerprint.

Beside `mycelium-value-json`: a storage container takes the one it is
given. AVRO's single-object encoding: two marker bytes (`C3 01`), the
8 bytes of the writer's schema's fingerprint, the value. Built on
`avsc`, its fork for Bare (`bare-for-pear/avsc`).

## Links

- [lib](lib/)
- [schemas](schemas/)
- [test](test/)

## Usage

```js
import { registry, avro, encode, decode, unfold, isLike, is } from 'mycelium-value-avro'
const reg = registry('/install/packages/schemas')   // or registry(): in memory
const h = avro(reg, 'haiccing/base-package-help/annotate-answer')
h.extension                     // 'avro'
const bytes = h.encode(answer)  // C3 01, the fingerprint, the value
h.decode(bytes)                 // read as that schema (is-like)
decode(reg, bytes)              // read as written
unfold(reg, bytes)              // every level decoded
isLike(reg, fingerprint, schema)  // { like, aliases } or { like: false, why }
is(reg, fingerprint, schema)      // AVRO's own: by name or declared alias
```

## Design

- **A schema's name is its URI**, where it comes from:
  `<org>/<package>/<name>`, a module's `<org>/<module>/<name>`
  (`haiccing/base-package-help/annotate-answer`); its AVRO fullname by
  the data-name mapping (`base-docs-uri`, "Data names"), exact both ways,
  each part its data name (`haiccing.basePackageHelp.annotateAnswer`):
  `fullnameOf`, `uriOf`. The name is the core type, the namespace its
  variant (`base-docs-avro`, "Core types"; `partsOf`). A name that does
  not map is still a valid schema, known by its fingerprint only.
- **Its identity is its fingerprint**, a content hash: the AVRO
  specification's CRC-64-AVRO of its Parsing Canonical Form, written as
  16 hex digits. A schema never changes; a new version is a new
  fingerprint, versions side by side.
- **The registry, an index, not a gatekeeper** (`registry(folder)`): what
  a fingerprint is, what a URI has been (`get`, `type`, `named`,
  `latest`, `list`); its three questions: what core types there are
  (`types`), the variants of a type (`variants`, by namespace), the
  versions of a variant (`versions`, by fingerprint, in the order the
  commits that brought them were registered: `add(schema, { commit })`);
  no version numbers; `add` never refuses a valid schema; no subjects
  bound to topics, no global ids, no compatibility modes. An install's
  is a folder of plain JSON documents, one a schema, named by its
  fingerprint, `{ fingerprint, uri, commit, added, schema }`, the schema
  whole;
  written by whoever registers (the creator, at deploy:
  `mrepo-base-boot`), read by every process of the install. The
  module's own schemas are always known.
- **The cascade**: each level a schema of its own, carrying the next as
  bytes in single-object encoding, never a union fixed in advance: the
  record (`schemas/record.json`, this module's), the request and its
  response (`mrepo-base-request`'s), the action's own (its arguments,
  its answer) or, where there is none yet, `json`. `decode` reads one
  level; `unfold` every level, each bytes value that is single-object
  encoded decoded in its place.
- **Is and is-like, one mechanism**: compatibility is the reader's
  question, at read time: AVRO's own resolution, unchanged, the
  writer's schema from the fingerprint against the reader's: fields by
  name, the writer's extra skipped, the reader's missing from their
  defaults, numbers widened, unions resolved.
  - **is** (`is`): the same core type, its record matched by its name
    without the namespace, as the specification says (`avsc` is told so:
    it compares full names by default), or a declared alias: the
    versions and variants of one type, evolved within the rules.
  - **is-like** (`isLike`, and `decode(reg, bytes, { as })`): a
    different core type read as another, aliases generated for the read
    only where the core types differ: the writer's schema and the reader's walked
    side by side, each named type of the reader's given the writer's
    fullname at the same position (a record's fields by name, an
    array's items, a map's values, a union's branch by structure, the
    first that fits); then the same resolution. Deterministic; the
    resolver cached per writer and reader; the aliases applied returned
    with the answer (`{ like, aliases }`), so an is-like can be
    explained. The same thing meant, with more or less detail.
- **The family is the scope of consistency** (`base` today): its core
  types read each other as above; data from another family comes in and
  goes out through an import and an export at a boundary, mapped and
  validated there. Not built.
- **An unknown fingerprint is an error** where it is read.
- **Unions**: plain values; a union of several records wrapped, as
  AVRO's JSON does (`{ <fullname>: value }`): a shape "Data shapes"
  avoids.
- **Logical types**: `json` (a record of one string, its JSON text; in
  memory the value) and `timestamp-millis` (a long; in memory ISO 8601
  text, as a record's timestamp is in JSON).

## Not instrumented

The functions are pure but for the registry's folder, read and written
as a container's documents: a run records the invocation of the unit
they are part of.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the fingerprint against the specification's values, names both ways, a value to bytes and back, an unknown fingerprint, the registry, is-like, the cascade unfolded; each test by its name in [test/](test/).
