# extract

Writes the mrepo's info layer from its linked packages' bundles, replacing what is there.

Each linked package's bundle is read for its READMEs, its `package.json`,
its list and its third-party record; where its list documents the store
(`"documents": "store"`), every other package in the store too, through
its packages manifest's mapping, read only. Run by a hook, where the
help is extracted (`initialise`); run again, it adds what is new and
changes nothing else (idempotent).

## Signature

`extractAction(exec, { uri })`: requested as `info/extract`, at the mrepo
itself.

## Returns

What it did, said, a fact a line: `Extracted the info of <n> packages:
<k> keywords, <p> pages.`; whether the layer changed (`The info layer
changed: <n> put, <n> removed.`, or `Nothing changed: the info layer as
it was.`); its problems (`<n> problems in its pages:
info/problems.json.`, or `No problems in its pages.`). Which files: what
the request changed, in its processing.

What it writes, in the `info` layer:

- each page once: `packages/<org>/<package>/...`,
  `modules/<org>/<module>/...`;
- split on package: each package's own index beside its pages,
  `packages/<org>/<package>/index.json`, its short keywords and their
  choices, `[{ page, section?, see?, oneliner, below, generated? }]`
  (`.` its README); a package's keywords are its own, kept apart;
- `index.json`: the mrepo's own keywords: the top, each organisation,
  `modules`, `third-party`;
- `packages.json`: the packages, the contexts, `{ oneliner, own?,
  documented? }`; `keywords.json`: a short keyword and the packages that
  have it;
- `modules/README.md`, `third-party/README.md` and
  each organisation's page, made here;
- `problems.json`: `[{ keyword?, page?, check, detail }]`;
- `.layer.json`, when the layer has none.

## Errors

- A URI that is not the mrepo itself.
- The packages manifest is no document; it documents the store and
  names none.

## Design

- **The top is the last package of the manifest**, the mrepo's own.
- A page that was there and is no more is removed.
- Problems are counted and logged as a warning; they do not fail the
  request: an mrepo starts with its pages as they are.
