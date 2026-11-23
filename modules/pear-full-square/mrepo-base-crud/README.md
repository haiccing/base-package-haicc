# mrepo-base-crud

The mrepo crud protocol: an mrepo's nodes created, read and deleted by URI.

The generic actions on an mrepo's data, for putting structure into
`main`. A node is a folder holding its document; a URI names one, or
selects several: a `*`, filters on the nodes' documents, a query read by
`mycelium-xpath` through `mrepo-base-xpath`. There is no update. Offered by
`haiccing/base-package-crud`.

## Links

- [external](external/)
- [internal](internal/)
- [test](test/)

## Commands

```
haicc . crud/create swarms/swarm-1 {"size":3}
haicc . crud/read swarms
haicc . crud/read swarms/*
haicc . crud/read "swarms/*[state='started']"
haicc . crud/delete swarms recurse
```

## Rules

- **Idempotent**: repeating a request is safe. `create` leaves a node
  that is there as it is; `delete` of one that is not there selects
  nothing and succeeds.
- **A selection is an array**: `read` and `delete` answer with the nodes
  selected, none included; nothing there is not an error.
- **Main from outside**: a request from outside names nodes in `main`.
  The mrepo's own requests name the layer first and may work on another
  layer; each such change is then a request, audited.
- **A shortcut is a node**: read, it says where its data comes from;
  deleted, the link goes, not what it leads to. A URI does not run
  through it.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the actions on an execution written for them.
