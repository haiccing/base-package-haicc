# test/

The tests of mycelium-container-document, a section per file, each test by its name.

## `documents.test.js`

- documents: written, listed in order, read, removed

## `stream.test.js`

- stream: a record's name is its offset, the time it arrived, in milliseconds
- stream: offsets only grow, never two the same: an offset taken, the next one
- stream: kept in buckets, two levels, each folder a prefix of the offset
- stream: listed in the natural order, the newest first; after, before, limit
- stream: senders in parallel, each its own process: every record its own offset, none lost
