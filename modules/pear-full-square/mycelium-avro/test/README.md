# test/

The tests of mycelium-avro, a section per file, each test by its name.

## `avro.test.js`

- the fingerprint: CRC-64-AVRO of a schema's contract form: what changes a read changes it, its descriptions do not
- a name is its URI, exact both ways; its core type and its variant
- a value checked against a type: a JSON value is one; where it is not, said; strict, a field not named refused
- a JSON value written as one type, read as another: the writer's extra skipped, the reader's missing from its default, numbers widened
- is and is-like, one mechanism: a core type's variant read as AVRO is; a different core type read as another, the aliases applied said
- the logical types: json, any JSON value in memory; timestamp-millis, its ISO text
- base64: bytes as base64 text in memory and in JSON, strictly; part of a schema's identity
- AVRO's own types, each by a URI: avro/<name>, no schema file
- a long text, longer than the library's encoding buffer (4096 bytes), whole both ways
