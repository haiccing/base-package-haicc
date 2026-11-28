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
  (its packages, the contexts), `modules`, `third-party`.

## Returns

What is said: its first line the keyword as it is asked, in its context,
and what it is (`haiccing/base-package-boot/deploy: Deploys a child.`);
then `Below it:`, a line each keyword below it, written as it is asked,
with what it is (`- <keyword>: <oneliner>`): what to ask next, as it is.
Several choices (a short keyword several packages have): each apart,
under `== <keyword> (<package>): <oneliner>`. Attached: the page itself,
a text (`avro/string`), without its menus (a section: its text), named
by its title, one a choice; the page is the product, attached and not
also said. The structure itself, for what
needs it exactly: the info layer's indexes (`info/index.json`, each
package's `index.json`, `keywords.json`).

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
