# mrepo-base-info

The mrepo info protocol: an mrepo's pages, extracted from its packages and read by keywords from the top down.

Every README of an mrepo's packages is a page. `extract` follows the
menus from the top, the README of the mrepo's own package, and writes
each page once, with an index from keyword to page; `get` answers a
page and the keywords below it. Offered by `haiccing/base-package-info`.

## Links

- [external](external/)
- [internal](internal/)
- [test](test/)
- [validate](validate/)

## Commands

```
haicc host info/get
haicc host info/get boot
haicc host info/get boot/deploy
haicc host info/extract
```

## Keywords

- **From the menus**: a README's `## Links`, a label each, is what is
  below it; a link may jump over folders (a package to its module's
  action). A README without one (the old form): the links of its text,
  each a problem.
- **The included packages**: a package that defines an mrepo lists them
  under `## Included packages`, each by its name without the prefix
  (`base-package-boot`, `boot`). None: taken from its list, a problem.
- **The sections**: each a keyword below its page.
- **Several meanings**: a keyword may reach more than one page; `get`
  answers each, a choice.
- **Made here**: `modules`, every module once, by its full name;
  `third-party`, from the packages' `third-party.json`.

## Rules

- **A page once**: a module carried by several packages is written once,
  at `modules/<org>/<module>/`; a package's link to it points there.
- **What does not fit is a problem**, never resolved silently: a link to
  nothing, a README no menu leads to, the old form, the included
  packages against the list, a module's copies that differ, two versions
  of a third-party module.
