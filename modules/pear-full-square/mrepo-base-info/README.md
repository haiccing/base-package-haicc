# mrepo-base-info

The mrepo info protocol: an mrepo's pages, extracted from its packages and read by keywords from the top down.

Every README of an mrepo's packages is a page. `extract` follows the
menus from the top and writes each page once, split on package, each
package's keywords its own; `get` answers a page in a package's context
and the keywords below it; `clear` removes the build. Offered by
`haiccing/base-package-info`.

## Links

- [external](external/)
- [internal](internal/)
- [test](test/)
- [validate](validate/)

## Commands

```
haicc host info/get
haicc host info/get haiccing
haicc host info/get haiccing/base-package-boot/deploy
haicc host info/get base-package-boot deploy
haicc host info/get howto/deploy
haicc docs info/get test-reports
haicc host info/extract
haicc docs info/clear
```

## Keywords

- **Split on package**: a package is self-contained; its keywords are
  its own, in its own index, kept apart from any other's. The top is the
  mrepo's own package's README; below it each organisation, and below
  that each package by its name fully qualified: the contexts.
- **The context in the keywords**: a path that starts with a package's
  name is in that package's context (`haiccing/base-package-boot/deploy`;
  its name alone where it is unique, `base-package-boot/deploy`). A
  short keyword without one: the mrepo's own package's, else the
  package that has it, else a choice of the packages that have it, each
  with the keyword to go on with. Every answer says its context; none is
  kept between requests (`external/get`).
- **From the menus**: a README's `## Links`, a label each, is what is
  below it; a link may jump over folders (a package to its module's
  action). A README without one (the old form): the links of its text,
  each a problem.
- **The included packages**: a package that defines an mrepo lists them
  under `## Included packages`, each by its name without the prefix.
  None: taken from its list, a problem.
- **The sections**: each a keyword below its page.
- **Several meanings**: a keyword may reach more than one page in a
  package, or be in several packages; `get` answers each, a choice.
- **Made here**: each organisation's page, its packages; `modules`,
  every module once, by its full name; `third-party`, from the packages'
  `third-party.json`; `schemas`, every schema the packages carry once
  (their `schemas/`, their modules'), by its URI, its fingerprint and its
  fields: what a binary record's fingerprint names (`crud/read` decodes
  one).

## Rules

- **A page once**: a module carried by several packages is written once,
  at `modules/<org>/<module>/`; a package's link to it points there.
- **What does not fit is a problem**, never resolved silently: a link to
  nothing, a README no menu leads to, the old form, the included
  packages against the list, a module's copies that differ, two versions
  of a third-party module.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): a README read and its rules, keywords, the extraction from the top down and what does not fit, the actions on an execution written for them, the template's bundle extracted; each test by its name in [test/](test/).
