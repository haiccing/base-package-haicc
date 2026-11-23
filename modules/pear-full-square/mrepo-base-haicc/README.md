# mrepo-base-haicc

The mrepo haicc protocol: a command executed at the positions a URI selects, or sent on at a shortcut.

`haicc <URI> <command>` means: go to this node position and execute the
command that follows, in the context of the node where the data originates
from. A script that works on data at one position keeps working when the
structure is moved: only the position it is sent to changes. Offered by
`haiccing/base-package-haicc`.

## Links

- [external](external/)
- [test](test/)

## Examples

```
haicc . boot/deploy host haiccing/base-component-haicc
haicc host service/stop
haicc host haicc swarms/swarm-1 boot/deploy node-1
haicc host/swarms/swarm-1 boot/deploy node-1
haicc "swarms/*[state='started']" crud/read .
```

## Tests

- `brittle-bare test/*.test.js` (Bare installed): goto on a context written for it.
