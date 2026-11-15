# test/mounted/

The package's own test: its protocol as it is mounted, without an mrepo.

The package's `protocol.js` is what a runtime loads. It is loaded here
and checked; its action is run on a minimal execution in memory, which
keeps what is executed here and what is sent on.

## What it checks

- **What it provides**: one protocol, `haicc`, with a function for every
  action configured and no other.
- **Its config, value by value**: `goto`, the default action, at any
  position, its one argument the command that follows; no state, no
  target: it is not behind the service's door.
- **`goto` at the root**: the command that follows executed here, once,
  as it was given, its value returned.
- **`goto` at a position inside `main`**: the command executed there,
  standing at the position; a URI that selects (a `*`, a filter): the
  command at each position, a list of what each gave, empty when nothing
  is selected.
- **`goto` at a shortcut**: the command sent on to the mrepo linked
  there, its folder in the shadow of `main`; nothing executed here. A
  command that is itself a `haicc` goes on as it is: they chain. A URI
  through the shortcut: what is left of it goes in front of the command.
- **What it refuses**: no command, a position that is not there or is a
  file, a shortcut beside other positions, a URI that is not canonical
  or not in `main`. A refusal executes and sends nothing.
- **Nothing forgotten**: the last test fails when the config names an
  action that was not run here, or one that wrote nothing into the
  request's log as it ran.

## Not here

A command as it is typed, `haicc` alone taken as `haicc/goto`: that is
the runtime's interpreting of a request. And a command really carried
through shortcuts between running mrepos, its response returned. Both
need a test mrepo; until this package has one, they are covered by the
boot component's test and the `haicc` command's.
