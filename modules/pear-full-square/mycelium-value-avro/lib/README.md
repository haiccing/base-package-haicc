# lib/

The parts of the encoding: the fingerprint, the names, the types, the registry.

- `fingerprint.js`: CRC-64-AVRO (Rabin) over a schema's Parsing
  Canonical Form, 16 hex digits; its 8 bytes little-endian in a
  single-object header.
- `names.js`: a schema's URI and its AVRO fullname, by the data-name
  mapping, exact both ways (`fullnameOf`, `uriOf`).
- `types.js`: a schema as an `avsc` type with our logical types (`json`,
  `timestamp-millis`); its canonical form, fingerprint and whole schema;
  is and is-like (`is`, `isLike`, `resolverOf`): AVRO's resolution, aliases generated for is-like.
- `registry.js`: the registry, a folder of documents or in memory.
