# schemas/

The module's schemas, each named by its URI, `pear-full-square/mrepo-base-request/<name>`.

- `request.json`: a request and its response (`request`), the form
  completed: `protocol`, `action`, `uri`, `args`, `flags`, `command`,
  then `output` or `error`, `continuation`, `log` (each entry `level`,
  `event`, `time`, its `data` a map of `json`), and `more`, the form's
  other fields as they are (open). `args` and `output` are the next
  level as bytes, single-object encoded: the action's own schema when one
  is given, else `json`. The second level of the cascade, read by the
  runtime, the gate, the log.
