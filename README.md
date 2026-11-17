# base-package-haicc

The haicc protocol: a command executed at a node position, or sent on where the node is a shortcut.

`haicc <URI> <command>` means: go to this node position and execute the
command that follows. At a shortcut, a node whose data originates in
another mrepo, the command is sent there unchanged. The command can be a
`haicc` itself, so commands concatenate. An mrepo that links this package
can be addressed at a position and can pass commands on to the mrepos
linked in it.

## Links

- [test](test/)
- [test-reports](test-reports/)
- [modules](modules/)

## Commands

```
haicc . boot/deploy host haiccing/base-component-haicc
haicc host service/initialise
haicc host haicc swarms/swarm-1 boot/deploy node-1
```

`haicc` alone is `haicc/goto`, the protocol's default action.

## Config

In `protocol.js`, the package's: `goto` at any position, and the
protocol's default action. The protocol is not behind the service's door:
the command that follows is checked where it is executed. `command:
true`: the words after its URI are a command, passed on as written, so a
flag list among them is that command's, not goto's.

## Package

- `protocol.js`: the `haicc` protocol, its config and its action, from
  `mrepo-base-haicc`.
- `main.js`: the dispatcher, the bundle's main, generated.
- No structure of its own: `main`, where the shortcuts are, is
  the runtime package's.
