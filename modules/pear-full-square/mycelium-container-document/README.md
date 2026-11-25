# mycelium-container-document

A storage container: a folder of documents, a file each; or a stream of
records, a record's name its offset.

Each document is written under a temporary name, then renamed, in the
encoding it is given (a handler such as `mycelium-value-json`). Writers may
work in parallel, each with its own names.

## Links

- [test](test/)

## Usage

```js
import { documents } from 'mycelium-container-document'
import * as json from 'mycelium-value-json'
const box = documents('/some/folder', json)
const name = box.add({ a: 1 })   // a new, time-ordered name
box.write('config', { b: 2 })    // a name of the caller's
box.list()                       // names, in order
box.read(name); box.remove(name)
```

## A streaming folder

A file data change record: a folder records only arrive in, each a file,
its name its **offset**: the milliseconds since the epoch when it
arrived, 13 digits. The folder's natural order is its offsets',
descending by default: the newest first.

- **Offsets only grow, never two the same**, and need not be
  consecutive: now, or the highest there plus one.
- **Given under the folder's lock**, the operating system's, on
  `<folder>/.lock`: senders in parallel, each its own process, wait
  their turn; a sender that dies releases it. `create` answers the
  offset: the sender's confirmation. The lock's file holds the last
  offset given, so `reserve()` gives one with no record written here:
  the stream as the one clock for what arrives beside it (an mrepo's
  own requests).
- **Kept in buckets**: folders named by a prefix of the offset, a level
  each length, `[5, 6]` by default (about 28 hours, then about 2.8):
  `done/17953/179531/1795312345678.json`. The buckets are the
  container's: a record is named by its offset alone, and a bucket is
  the unit housekeeping moves out later.
- **One name everywhere**: the same record in another folder is `put`
  under the offset it was given.

```js
import { stream } from 'mycelium-container-document'
const log = stream('/some/folder', json)       // { buckets: [5, 6] }
const offset = log.create({ a: 1 })            // or create(o => ({ offset: o }))
log.read(offset); log.has(offset)
log.list({ limit: 100 })                       // the newest 100
log.list({ after: pointer, ascending: true })  // what came after a pointer
```

## Tests

- `brittle-bare test/*.test.js` (Bare installed): documents written, listed in order, read, removed; a streaming folder's offsets, buckets, order and lock; each test by its name in [test/](test/).
