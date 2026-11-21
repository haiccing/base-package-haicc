# schemas/

The module's own schemas, the record and the json type, always known to every registry.

- `record.json`: a record, as Kafka's (`record`): `topic`, `key`,
  `timestamp` (milliseconds; in memory ISO 8601 text), `headers` (a map
  of `json`), `value`, the next level as bytes in single-object
  encoding. The first level of the cascade, read by what carries records.
- `json.json`: the declared `json` type (`json`): any JSON value as its
  text, in memory the value; for the named edges where nothing is typed
  yet (`base-docs-uri`, "Data shapes").
