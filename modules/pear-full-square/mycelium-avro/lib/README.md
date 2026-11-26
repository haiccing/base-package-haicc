# lib/

The engine's parts: the fingerprint, the names, the types, the values.

## Parts

- `fingerprint.js`: CRC-64-AVRO (Rabin) over a schema's Parsing
  Canonical Form, 16 hex digits; its 8 bytes little-endian (`bytesOf`,
  `hexOf`).
- `names.js`: a schema's URI and its AVRO fullname, by the data-name
  mapping, exact both ways (`fullnameOf`, `uriOf`); its core type and
  its variant (`partsOf`).
- `types.js`: a schema as an `avsc` type with our logical types (`json`,
  `timestamp-millis`); its canonical form, fingerprint and whole schema;
  is and is-like (`is`, `isLike`, `resolverOf`): AVRO's resolution,
  aliases generated for is-like.
- `values.js`: a value checked against a type (`valid`), a value of one
  type read as another (`readAs`).
