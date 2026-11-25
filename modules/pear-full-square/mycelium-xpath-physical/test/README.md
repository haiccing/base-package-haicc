# test/

The tests of mycelium-xpath-physical, a section per file, each test by its name.

## `physical.test.js`

- the structure types there are; one not there is said
- tree: its physical query is the logical one, once; its result the whole answer
- a node set read: nothing loaded until it is asked; a batch by a physical query, seen; the answer the engine gives
- a node set read to its end, and node by node
- XPathResult and XPathIterator: a result says what was asked and its translation; its iterator gives the next node, slices fetched behind the scenes

## `offset-files.test.js`

- offset-files: the physical queries of a batch: from the fixed offset back, a folder at a time, by name and position; no record opened
- offset-files: fixed at the time of the request: what arrived after is not in it
- offset-files: what is asked of the records goes with each batch: a filter on their data, a path into them; only the batch opened
- offset-files: a topic that is its layer; other levels; a batch larger than what is there
- offset-files: an offset is an index: one record by a scan of its folder; bounds say where the reading starts and stops
- offset-files: what is no topic's records, and a position in its query, said
- offset-files: ascending: the same topic from its earliest on, or from a lower bound; up to the fixed offset, no record opened
