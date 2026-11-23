# clear

Removes the mrepo's info layer build: every page, index and document an extraction wrote.

What `extract` wrote is removed, as its own documents name it: the pages
its indexes name, each package's index, the documents made at
extraction. The layer's own config stays. Run by a hook: the docs
mrepo's `shutdown`, its `initialise` building it again.

## Signature

`clear(exec, { uri })`: requested as `info/clear`, at the mrepo itself.

## Returns

`{ removed }`: how many files were removed. Nothing built: a repeat,
`{ removed: 0, again: true }`, a warning in its log (idempotent).

## Errors

- A URI that is not the mrepo itself.

## Design

- **Its own documents say what to remove**: nothing in the layer that an
  extraction did not write is touched.
