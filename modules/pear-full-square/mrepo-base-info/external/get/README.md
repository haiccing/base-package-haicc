# get

Answers a page of the mrepo's info by its keywords, with the keywords below it.

## Signature

`get(exec, { uri, args })`: requested as `info/get [<keywords>]`, the
keywords where the URI is, no dot.

## Arguments

- `uri`: the keywords, a path from the top, `boot/deploy`; the prefix
  `main` of a request from outside not among them; `.`: the top.
- `args`: more keywords, as words, `boot deploy`.

## Returns

`{ keyword, choices }`: each choice a page the keyword reaches, `{
title, oneliner, page, below, packages, see?, generated? }`: its text
without its menus (a section: its text), each keyword below it, `{
keyword, oneliner, choices }`, and the packages it is from,
`[<org>/<package>...]`.

## Errors

- No info extracted yet.
- A keyword that is not there: the nearest one above it, and what is
  below that.

## Design

- **The same page once**: a page the same in several packages (a
  template's generic page, say) is one choice, its packages all named;
  pages that differ stay apart, each with its package.
