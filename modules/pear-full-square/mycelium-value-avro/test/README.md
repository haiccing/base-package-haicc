# test/

The tests of mycelium-value-avro, a section per file, each test by its name.

## `avro.test.js`

- the fingerprint: CRC-64-AVRO of the Parsing Canonical Form
- a name is its URI, exact both ways
- a value to bytes and back, single-object encoded
- an unknown fingerprint is an error where it is read
- the registry: an index, by fingerprint and by URI, never refusing; its core types, their variants, their versions
- is-like: read as the reader needs, record names not required to match
- is and is-like, one mechanism: a core type's variant read as AVRO is; a different core type, the log viewer's line, reading a node's log entry, its key skipped; the aliases applied said
- the cascade: each level carrying the next, unfolded
