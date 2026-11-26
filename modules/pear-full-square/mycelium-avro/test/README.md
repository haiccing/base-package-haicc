# test/

The tests of mycelium-avro, a section per file, each test by its name.

## `avro.test.js`

- the fingerprint: CRC-64-AVRO of the Parsing Canonical Form
- a name is its URI, exact both ways; its core type and its variant
- a value checked against a type: a JSON value is one; where it is not, said; strict, a field not named refused
- a JSON value written as one type, read as another: the writer's extra skipped, the reader's missing from its default, numbers widened
- is and is-like, one mechanism: a core type's variant read as AVRO is; a different core type read as another, the aliases applied said
- the logical types: json, any JSON value in memory; timestamp-millis, its ISO text
