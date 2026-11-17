# info

Reads a README and its menus, checks it against the README rules, and makes an mrepo's info layer from its packages.

## Signature

- `parse(text)`: `{ title, oneliner, summary, sections, menu, included,
  table, first }`.
- `check(text)`: `[[check, detail]...]`, the README rules and the menu's
  form.
- `extract(packages, { alone })`: the files of the layer, by path;
  `alone`, a package on its own, its included packages not there.
- `keyword(words)`, `packageKeyword(pkg)`: a keyword's form.

## Arguments

- `packages`: in deploy order, the mrepo's own last of its list, each
  `{ pkg, files, paths, documented? }`: its READMEs, `package.json`, list
  and third-party record, by path in its bundle. `documented`: a package
  documented beyond the list (`documents` in it), after the list, walked
  at its keyword below the top as an included package is.

## Also exported

`LAYER`, `TOP`, `MENU`, `INCLUDED`, `GENERATED`.
