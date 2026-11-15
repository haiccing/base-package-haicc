# mrepo-base-xpath

XPath in an mrepo: a request's URI resolved to what it selects, and where it stops at a shortcut.

Internal functionality of the runtime, beside request and execute: nobody
requests it, it has no protocol. The `haicc` protocol's `goto` uses it to
tell where a command is executed, the `crud` protocol to tell which nodes
a URI selects, and the boot protocol to place and remove the shortcuts of
the mrepos it deploys. The query itself is `mycelium-xpath`'s: this
module hands it the mrepo as a tree.

| | |
|---|---|
| [internal/](internal/) | its methods |
| [test/](test/) | its tests |

## Shortcuts

A shortcut is in `main`, beside its node's document, under a hidden
name: a list of the sources the node's data comes from, each by its
unique URI. Only the link: nothing local to a machine.

```
/main/host/.shortcuts.json     [{ "mrepo": "local/host" }]
```

## Unique URIs

Every mrepo has a unique URI, `<swarm>/<node>`, in its runtime layer
(`/runtime/mrepo.json`). What the boot mrepo creates is `local/<name>`:
`local/host`. A shortcut names the mrepo it leads to by that URI.

## Tests

- `npm test`: URIs resolved on a context written for it.
