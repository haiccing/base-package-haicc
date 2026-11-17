# base-package-haicc

The haicc protocol: a command executed at a node position, or sent on where the node is a shortcut.

`haicc <URI> <command>` means: go to this node position and execute the
command that follows. At a shortcut, a node whose data originates in
another mrepo, the command is sent there unchanged. The command can be a
`haicc` itself, so commands concatenate. An mrepo that links this package
can be addressed at a position and can pass commands on to the mrepos
linked in it.

## Links

- [goto](modules/pear-full-square/mrepo-base-haicc/external/goto/)
- [howto](howto/)
- [test](test/)
- [test-reports](test-reports/)
- [modules](modules/)

## Config

The `haicc` protocol's, in `protocol.js`; no state, not behind the
service's door: the command that follows is checked where it is
executed.

| action | offered at | arguments |
|---|---|---|
| `goto`, the default: `haicc` alone | any position (`**`) | the command that follows, passed on as written |

`command: true`: the words after its URI are a command, so a flag list
among them is that command's, not goto's.

## Package

- `protocol.js`: the `haicc` protocol, its config and its action, from
  `mrepo-base-haicc`.
- `main.js`: the dispatcher, the bundle's main, generated.
- No structure of its own: `main`, where the shortcuts are, is
  the runtime package's.
