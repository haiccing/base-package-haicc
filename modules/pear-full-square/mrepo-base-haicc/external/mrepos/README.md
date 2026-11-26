# mrepos

Lists the install's mrepos as its registry holds them, read only, selected by an xpath.

The registry is the work folder's `mrepos/`: every mrepo's folder by its
unique URI (as its identity says it: the boot mrepo's folder is
`mrepos/boot`, its unique URI `local/boot`), for the install's system
administration. It is consulted
here, never written; nothing is routed: what is found is used like any
other position.

## Signature

`mrepos(exec, { uri })`: requested as `haicc/mrepos [<xpath>]`, the
xpath where the URI is, in an mrepo with a work folder:

```
haicc . haicc/mrepos
haicc . haicc/mrepos local/docs
haicc . haicc/mrepos "local/*"
haicc . haicc/mrepos "*/*[package='haiccing/base-component-docs']"
```

## Arguments

- `uri`: an xpath over the mrepos: a path of their unique URIs'
  segments, `*` for any, filters on their records; none, or `.`: every
  one. The prefix `main` of a request from outside not part of it.

## Returns

`<n> mrepos in the install's registry.` (selected: `<n> of the install's
<m> mrepos selected by <xpath>.`), then a line each, in unique URI
order, its unique URI first, exact: `<uri> at <position>, from
<package>, running.`

- its position: where it is from the mrepo asked, the positions of the
  links down to it, forward only (`workbench/docs`; `.`, the mrepo
  itself); `not reached from here` where it is not forward of it;
- its package: the one that defines it (its list's last);
- `running` or `not running`: its runtime answering over its socket.

Nothing selected: said, `None of the install's <m> mrepos selected by
<xpath>.`

## Errors

- No work folder in the mrepo: the registry is not there.
- A query its xpath does not read (as `crud/read`'s).

## Design

- **Read only, nothing routed**: `haicc/goto` stays as it is; the
  position is what a caller uses next (`haicc workbench/docs info/get`).
- **Forward visibility kept**: a position is found only through links,
  from the mrepo asked down.
