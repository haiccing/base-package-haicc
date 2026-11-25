# lib/

The parts of mrepo-base-request, a file each, imported by its `index.js`.

| file | |
|---|---|
| `boxes.js` | A repository's boxes, as layers: `inbox` and `outbox`, non-atomic (git on disk), streaming: a record a document under its offset, in folders by its digits; the drop method, the one way a record is dropped into an inbox; nothing removed (housekeeping later). |
| `command.js` | A command: a request as it is typed, its parts in order, `<protocol>/<action> <URI> <argument>...`, interpreted into the form the mrepo works with. |
| `flags.js` | A request's flags: what is asked of the way a request is handled, beside what it asks for; the flags there are, `flags/`, read, none named. |
| `follow.js` | The requests followed, as they move: each record arriving in an mrepo's request layers (pending, execute, done), and its children's in view `(<dir>/main/<name>/`, theirs too), printed as it is stored, one compact line a record, its envelope's topic the full path (/boot/request/done, /boot/main/host/request/pending/default). |
| `hooks.js` | Hooks: the commands an mrepo runs on a status transition, as files its defining package dropped into its runtime layer, one folder a transition. |
| `layer.js` | Records in a layer of the repository (a git branch): one JSON document a record, its name its offset; a streaming layer's in folders by its digits. |
| `record.js` | A record: the base's minimum, { topic, offset, timestamp, headers, value }; its offset its identity; the headers left empty for now (their use to be planned). |
| `typed.js` | A request record as AVRO, the cascade: the record (mycelium's), its value the form completed (`schemas/request.json`), in that its arguments and its output, the action's own when given, else `json`; a node's log, a record each (`logHandler`). |
| `view.js` | A repository's folder: `<work>/mrepos/<name>/`, its git on disk (.git), and a layer's files at the path of its URI (/inbox at `<work>/mrepos/<name>/inbox).` |
