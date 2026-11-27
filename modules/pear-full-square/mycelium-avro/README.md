# mycelium-avro

The base family's schemas in AVRO, whatever the encoding: types, names by URI, fingerprints, validation, is and is-like.

The engine of the type system (`haiccing/base-docs-avro`): a schema, in
AVRO's schema language, as a type; its name and its fingerprint; a value
checked against it; a value of one type read as another. It stores
nothing and encodes nothing to keep: a registry, AVRO's binary and its
containers are built on it. A JSON value is typed by it as any other:
our JSON keeps AVRO's shapes. Built on `avsc`, its fork for Bare
(`bare-for-pear/avsc`).

## Links

- [lib](lib/)
- [test](test/)

## Usage

```js
import { typeOf, fingerprint, valid, readAs, is, isLike, fullnameOf } from 'mycelium-avro'
const writer = typeOf(schema)          // a schema (JSON) as a type
fingerprint(writer)                    // 16 hex digits, its identity
fullnameOf('haiccing/base-package-rns/lookup-entry')  // 'haiccing.basePackageRns.lookupEntry'
valid(writer, value)                   // { valid: true } or { valid: false, problems }
readAs(writer, reader, value)          // the value as the reader has it
is(writer, reader)                     // { is } : AVRO's own, by name or declared alias
isLike(writer, reader)                 // { like, aliases } or { like: false, why }
```

## Design

- **The schema concern only**: no registry, no folder, no bytes kept.
  What needs a type by its name or its fingerprint asks a registry; this
  module is given the schemas.
- **Whatever the encoding**: `valid` and `readAs` take a value as it is
  in memory, a parsed JSON document among them.
- **Strict** (the human, 2026-11-26: "you can move to strict now, not
  lenient"): a value with a field its type does not name is not valid,
  the place said; nothing passes unnamed.
- **Read as another, through AVRO's binary**: `readAs` writes the value
  with the writer's type and reads it with the reader's resolver, so
  the rules applied are AVRO's own, not a second implementation of them.
- **Is and is-like, one mechanism**: AVRO's resolution, a record matched
  by its name without the namespace, the core type; is-like, aliases
  generated on the reader where the core types differ, returned with
  the answer.
- **The fingerprint, of the contract form** (the human, 2026-11-27:
  "can't you amend how the fingerprint is created?"): the
  specification's CRC-64-AVRO, of the schema whole without its
  descriptions, not of AVRO's Parsing Canonical Form, which also
  leaves out defaults, aliases and logical types: those change how
  data is read, so they change the fingerprint. The full name is part
  of it, so a variant has its own. AVRO's own form is `canonicalOf`.
- **Logical types**: `timestamp-millis` (in memory its ISO 8601 text);
  `base64` (bytes: in memory and in JSON their base64 text, ours, not
  AVRO's JSON form of bytes; strict: only text that decodes and encodes
  back to itself); `json` (a record of one string, its JSON text), the
  first build's, not used by what is brought to the request. Each part
  of the contract form, so of the fingerprint.
- **AVRO's own types by a URI** (the human, 2026-11-27: "Wouldn't we
  have an AVRO URI type?"): `avro/string`, `avro/long`, ... (`null`,
  `boolean`, `int`, `long`, `float`, `double`, `bytes`, `string`):
  `primitiveOf(uri)`, `isPrimitive(uri)`; no schema file, held by
  everyone.
- **No encoding here**: a value's bytes by a type are
  `mycelium-value`'s.
- **Copied from `mycelium-value-avro`** (2026-11-26), its types, names
  and fingerprints as they were; that module is not changed and not
  used.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the fingerprint against the specification's values, names both ways, a JSON value checked and read as another type, is and is-like, the logical types, AVRO's own types by URI; each test by its name in [test/](test/).
