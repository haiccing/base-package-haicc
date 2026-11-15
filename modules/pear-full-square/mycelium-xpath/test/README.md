# test/

The tests of mycelium-xpath, a section per file, each test by its name.

## `tree.json`

Shared by the tests, not a test itself.

## `query.test.js`

- query: steps by name, * and .
- query: what is found is references, nothing of them read
- query: a document goes on below its node
- query: a filter compares a leaf
- query: a filter asks whether a leaf is there, by a path too
- query: and, or, not, several in a row
- query: name(), starts-with(), contains()
- query: it goes on after a filter
- query: where it must stop, with what is left
- query: a document read once, a stop asked once
- query: each round through step, to be measured
- query: match replaces exact matching of a name
- query: name gives a document's key its name in a query and in a path
- query: async children and documents
- query: without document and stop, a tree of names only
- query: what is not a query, and what is not of this phase

## `xpath.test.js`

- select: plain steps
- select: * steps
- select: exact by default, match for the boundary
- async children
