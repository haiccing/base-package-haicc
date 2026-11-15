# goto

Executes the command that follows at each position a URI selects, or sends it on at a shortcut.

`haicc` alone is `haicc/goto`: the protocol's default action. The command
that follows is the action's arguments, its parts as typed. It can be a
`haicc` itself, so commands concatenate, each URI local to the mrepo it
is in.

## The URI

It names one position in `main`, or selects several: it is a query
(`mycelium-xpath` says what of XPath is built), read through
`mrepo-base-xpath`. At a command line a query is quoted, its stars and
brackets being the shell's too:

```
haicc swarms/swarm-1 crud/read .
haicc "swarms/*[state='started']" service/start
```

## Signature

`goto(exec, { uri, args })`: requested as `haicc <URI> <command>`.

## Arguments

The command that follows, its parts: `<protocol>/<action> <URI>
<argument>...`.

## Returns

- A URI that names one position: what the command returns: executed
  here, its value; sent on, the response of the mrepo it was sent to.
- A URI that selects (a `*` or a filter in it): a list, what the command
  gave at each position, in order: `[{ "at": "swarms/swarm-1", "value":
  ... }]`. Nothing selected: an empty list.

## Errors

- No command follows: `missing argument: command`.
- The URI is not in `main`.
- A position named that is not there: `no node there`. One that is no
  position: a file, a value inside a document.
- A URI that reaches a shortcut among other positions, or several: `not
  yet`. A command goes on from one shortcut at a time: a known issue,
  resolved when the query has its union.
- Those of the command itself. One position failing fails the request.

## Design

- **At a shortcut** the command is sent on: the hop takes its own
  `haicc <URI>` off. Where the URI runs on through the shortcut, what is
  left of it goes in front of the command, a `haicc` there: from one
  local root to the next. A filter on the shortcut itself goes with it:
  its document is in the mrepo it leads to. This request waits for the
  response.
- **At an ordinary node** the command is executed here, in the context of
  the position: forward visibility only, nothing above it is reachable.
  The command that follows stands at the position: its URI is read
  behind the position, as its prefix. A position is a folder in `main`;
  the mrepo itself (`.` written at its root) is one for its own commands.
- **A command is a map over the positions**: the same command at each,
  one after the other, in this one request.
