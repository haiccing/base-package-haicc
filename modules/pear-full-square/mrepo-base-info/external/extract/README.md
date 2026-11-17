# extract

Writes the mrepo's info layer from its linked packages' bundles, replacing what is there.

Each linked package's bundle is read for its READMEs, its `package.json`,
its list and its third-party record. Run by a hook, where the help is
extracted.

## Signature

`extractAction(exec, { uri })`: requested as `info/extract`, at the mrepo
itself.

## Returns

`{ keywords, pages, changed, problems }`: how many keywords and pages,
whether the layer changed, how many problems.

What it writes, in the `info` layer:

- each page once: `packages/<org>/<package>/...`,
  `modules/<org>/<module>/...`;
- `modules/README.md` and `third-party/README.md`, made here;
- `index.json`: each keyword and its choices, `[{ page, section?, see?,
  oneliner, below, generated? }]`;
- `problems.json`: `[{ keyword?, page?, check, detail }]`;
- `layer.json`, when the layer has none.

## Errors

- A URI that is not the mrepo itself.
- The packages manifest is no document.

## Design

- **The top is the last package of the manifest**, the mrepo's own.
- A page that was there and is no more is removed.
- Problems are counted and logged as a warning; they do not fail the
  request: an mrepo starts with its pages as they are.
