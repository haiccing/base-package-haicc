# get

Answers a page of the mrepo's info by its keywords, in a package's context, with the keywords below it.

## Signature

`get(exec, { uri, args })`: requested as `info/get [<keywords>]`, the
keywords where the URI is, no dot.

## Arguments

- `uri`: the keywords, a path from the top; the prefix `main` of a
  request from outside not among them; `.`: the top.
- `args`: more keywords, as words.

## The context

A package is self-contained: its keywords are its own, kept apart from
any other's. The keywords are read in a package's context:

- **Written in front**: a path that starts with a package's name, fully
  qualified (`haiccing/base-package-boot/deploy`) or, where it is the
  only one of that name in the mrepo, its name alone
  (`base-package-boot/deploy`). Its own keywords only, from its own
  index.
- **A short keyword without one** (`deploy`): the mrepo's own package's,
  when it has it (an mrepo answering about itself); else the one
  package that has it; else each package that has it, a choice each,
  kept apart, each written with its context to go on with.
- **The mrepo's own keywords** need none: the top, each organisation
  (its packages, the contexts), `modules`, `third-party`, `schemas`.

## Returns

`{ keyword, context?, choices }`: the keyword as it is asked, in its
context (`haiccing/base-package-boot/deploy`); the context, the package,
when there is one; each choice a page the keyword reaches, `{ title,
oneliner, page, below, context?, packages, keyword?, see?, generated?
}`: its text without its menus (a section: its text), each keyword below
it, `{ keyword, oneliner, choices }`, written as it is asked, in its
context: what to ask next, as it is. A choice of several packages
carries its own `keyword` and `context`.

## Errors

- No info extracted yet.
- A keyword that is not there: in a context, the nearest one above it
  there and what is below that; without one, the top and what is below
  it.

## Design

- **Packages apart**: the same page in two packages is two choices, each
  in its package: a package's boundary stays visible.
- **No state**: the context is in the keywords asked, never kept between
  requests; every answer says it.
