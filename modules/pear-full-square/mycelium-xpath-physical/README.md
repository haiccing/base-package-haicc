# mycelium-xpath-physical

The physical side of a query: a node set's physical XPath, by its storage's structure type.

A query is logical: it answers a node set (`mycelium-xpath`), a data
structure that says what is asked, where it has read to and what its
storage is. This module turns that into the physical XPath that fetches
the node set's next batch from the tree as it is stored. It is the one
place where logical becomes physical, and where each physical query can
be seen.

## Links

- [internal](internal/)
- [test](test/)

## Structure types

One implementation a way of storing, dispatched on the node set's
`physical.type`:

| type | what it is |
|---|---|
| `tree` | a plain tree, read as it is: its physical XPath is the logical one, its answer one batch |
| `offset-files` | a topic stored a record a file named by its offset, in folders by its digits (a streaming layer): batches of 50 from the latest back, each physical query inside one folder, by name and position |

To come: an AVRO container, a Hypercore topic.

## API

- `next(set)` → the physical query for the next part of the node set's
  next batch, its text; `null`: no more
- `took(set, text, result)` → `{ nodes, stopped, reached, done, full }`:
  what that query's result is to the node set: the nodes it gave, where
  it stopped at a shortcut, where the node set has now read to, whether
  that is its end, whether its batch is full
- `addressOf(set, path)` → a stored path as its logical address: what a
  reader of the result sees (`mycelium-xpath`'s `XPathResult`)
- `isType(name)` → whether it is a structure type there is; `TYPES`

Pure functions of the node set's data: nothing is read here. The query
is executed by who reads the node set (`mycelium-xpath`'s `reader`),
with the engine, on the stored tree.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): a node set read through its structure type; each test by its name in [test/](test/).
