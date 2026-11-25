# info

Reads a README and its menus, checks it against the README rules, and makes an mrepo's info layer from its packages.

## Signature

- `parse(text)`: `{ title, oneliner, summary, sections, menu, included,
  table, first }`.
- `check(text)`: `[[check, detail]...]`, the README rules and the menu's
  form.
- `extract(packages, { alone })`: the files of the layer, by path,
  split on package (`external/extract`); `alone`, a package on its own,
  its included packages not there.
- `built(exec)`: what an extraction wrote in the layer, as its own
  documents name it, by path (`external/clear` removes it).
- `keyword(words)`, `packageKeyword(pkg)`: a keyword's form;
  `packageKey(pkg)`, a package's keywords in full form, its name
  fully qualified (`haiccing/base-package-boot`).
- `withSteps(text, script)`: a how-to's page with its script in its
  `## Steps` (made before `## Notes`, or last, where it has none).

## Arguments

- `packages`: in deploy order, the mrepo's own last of its list, each
  `{ pkg, files, paths, documented? }`: its READMEs, `package.json`, list,
  third-party record and how-tos' scripts (`WANTED`), by path in its
  bundle. `documented`: a package
  documented beyond the list (`documents` in it), after the list, walked
  below its organisation as an included package is.

## Also exported

`LAYER`, `TOP`, `MENU`, `INCLUDED`, `GENERATED`; `WANTED`, what
extraction reads of a package's files (the action, the tools and the
validation alike); `STEPS`, a how-to's script's name, `steps.haicc`.
