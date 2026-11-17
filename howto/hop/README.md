# hop

A command taken to another mrepo: sent on at a shortcut, once or chained.

`haicc <URI> <command>` goes to the position the URI names and executes
the command there; where the URI reaches a shortcut, the command is sent
on to the mrepo it leads to, with what is left of the URI.

## Steps

```sh
# at the host: sent on at its shortcut in the boot mrepo
haicc host info/get
# chained through two shortcuts: the boot mrepo, the host, its node
haicc host haicc node-1 info/get
# at a position inside the host, a swarm's node, then on at its shortcut there
haicc host haicc swarms/swarm-1/node-1 info/get
# below a shortcut, a URI does not run through: the hop says the way
haicc . crud/read host/swarms
```

## Notes

- **`haicc` alone is `haicc/goto`**, the protocol's default action.
