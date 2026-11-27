# mycelium-value

The simple value transformations: one value to bytes and back, by a handler.

A handler is what a storage container is given
(`mycelium-container-document`): an extension, an encode, a decode. The
simple ones are here; a transformation that brings its own machinery (a
Parquet file, an AVRO container file) has a module of its own (the
human, 2026-11-27: "why not mycelium-value for the simple value
transformation, and the more complex ones can have their own module?").

## Links

- [test](test/)

## Usage

```js
import { json, avro } from 'mycelium-value'
import { primitiveOf } from 'mycelium-avro'
json.encode({ a: 1 })                  // <Buffer '{"a":1}\n'>
json.decode(bytes)                     // { a: 1 }
const text = avro(primitiveOf('avro/string'))
text.encode('abc')                     // <Buffer 06 61 62 63>
text.decode(bytes)                     // 'abc'
```

## Design

- **A handler**: `{ extension, encode(value), decode(bytes) }`.
- **`json`**: one line of JSON.
- **`avro(type)`**: AVRO's binary of a value by the type it is given
  (`mycelium-avro`'s). Plain: the value's bytes and nothing else, for
  within an install, where a type's URI names one schema
  (`base-docs-vision`, "Type system"). It is given its type and looks
  none up.
- **Checked before it is written**: a value that does not fit its type
  is said with its place; bytes that are no value of the type are said
  as that.
- **Not here yet**: bytes with their schema's fingerprint in front, the
  form for what crosses between installs or is kept over time: when
  something does.
- **In place of a module a value type**: `mycelium-value-json` and the
  first build's `mycelium-value-avro` go as what uses them is brought
  over.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): a value to bytes and back, as JSON and as AVRO's binary by a type; each test by its name in [test/](test/).
