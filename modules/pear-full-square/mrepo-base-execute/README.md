# mrepo-base-execute

The mrepo execute protocol: it runs the request in `request/execute` and
squashes its changes into their targets.

An action runs on the request's own execution branches,
`execute/<key>/<target>`, inside an execution context: it reads the targets
overlaid and writes only those branches. It may commit locally as it goes. When it ends, each
branch is squashed into its target, one commit there; a failure resets instead. The runtime,
`mrepo-base-runtime`, runs it, with the actions the mrepo's packages offer.

## Links

- [lib](lib/)
- [test](test/)

## Design

- **Request branches**: a request is processed on its own,
  `execute/<key>/<target>`. Its branch of `request/execute` holds its
  principal, begun there by the request protocol, and only ever adds; the
  others are made as the request first writes a target. At its end each
  is squashed into its target (one commit there, the request's: what it
  did on its branch, commit by commit, stays out of the target's
  history) and removed; discarded on a failure. Its branch of
  `request/execute`, the request's record, is merged, a plain merge.
- **A job waited for** (`exec.wait(job)`, `lib/wait.js`): an action
  parks its request until an outside job, an async function, ends; its
  writes so far are dropped, the runtime is free meanwhile. The job's
  result is written as a completed record into the mrepo's own
  `waiting/outbox` under an offset of the mrepo's, collected as a linked mrepo's response is,
  and the action executed again with it: `form.resumed`, `{ output }` or
  `{ error }`. One wait a request.
- **A command sent on** (`exec.forward(to, command)`, `lib/remote.js`): an
  action that finds its position a shortcut sends the command that follows
  to the mrepo linked there, unchanged, into its inbox folder. Nothing of
  the request is executed here; its processing ends: what it waits for
  (`remote`) is added to its principal. A request branch not being
  processed has a waiting principal. Once the request protocol has added
  the other mrepo's response to the branch, the principal is returned with
  it here.
- **A continuation** (`exec.continuation(script, at)`): an action
  answers, beside its output, with a script for who asked to go on with:
  shell text calling `haicc`, and the position in this mrepo it is run
  for. One a request, at most 64 KiB; none with an error. Not run here:
  the terminal runs it with `sh`. One that comes back from a linked mrepo is returned
  with the response, its position behind the one the command was sent
  on at.
- **What is not there is said with what is**: `no protocol: <name>`, with
  the mrepo's protocols; `no action: <protocol> <action>`, with the
  protocol's actions.
- **A command executed here** (`exec.run(command, { own })`): its parts
  interpreted, checked as the request itself is, its action run in the
  same execution; its value returned. `own`: as the mrepo's own, not held
  at the door; the service runs its hooks so.

The mrepo execute protocol, base variant: a request in `request/execute`
executed in execution
branches made from their targets (`execute/main`, `execute/runtime`,
`execute/request/execute`), its action run inside the execution context
(read-only to it: the targets read overlaid, the execution branches written,
the runtime's context read through `exec.runtime`; the request's id,
`exec.id`, its record's offset, its name in `request/done` once done), its
record completed,
each branch squashed into its own target. `executed(ctx, name, record)`
hands over a form completed elsewhere the same way (the boot's own request).
Run by the repository's runtime
(`mrepo-base-runtime`). It has no actions of its own: they are the
mrepo's packages'; its tests run it with `crud`. An
action writes the targets the mrepo has: `main`, `runtime`, `info`,
`protocols`, `links`. A path it reads or writes by is given relative from the
mrepo's root (`runtime/service.json`) or slash-led, the same.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the execution of a request: its branches from their targets and their squash, the context the action reads through, local and global commit and rollback, the log and its steps, an error at the boundary, and `exec.run`, `exec.continuation`, `exec.forward` and `exec.wait`; each test by its name in [test/](test/).

## The context

The action's context (`exec`): `read`, `select` (overlaid: a target read
from its execution branch), `find` (as `read`, for a file that may not be
there: `null` then; anything else that goes wrong is thrown), `node`,
`children`, `bytes` (the tree itself, for a query: the one node at a plain
URI as the execution sees it, a node's children, a file's content), `put`,
`remove` (collected), `runtime` (the
runtime's context, read only: its name, its work folder, its directory). Two
contexts:
local, the action's: `commit()` (the writes so far committed to the
execution branches; later reads see them), `discard()` (the uncommitted writes
dropped), `rollback()` (the last local commit undone), `log(level, event, data)`
(an entry in the request's own record, under the action's protocol and
action), `step(event, data, fn)` (a step of the action run and measured
here: its entry at `verbose` with what it took and what it read and wrote
meanwhile; `data` an object, or a function of `fn`'s result), `reset()`
(everything of this execution
ditched, back to the start), the action going on; global, the runtime's,
not the action's: when the action ends, its writes committed and the
execution branches squashed into their targets, once; a failure resets.

## The request's log

Made here, at the boundary, for every request, whatever its action does.
How much is kept is the request's flag, `log=info|verbose|debug`; `info`
without it. An error and a warning are always kept.

- **`info`**: what the request changed, a target a line
  (`request.changed`: the paths added, changed and removed, from the two
  trees; the first hundred, then a count), where it was sent on
  (`request.sent`), and its metrics, the closing line (`request.metrics`:
  `ok`, `ms`, `reads`, `selects`, `puts`, `removes`, `commits`), counted
  here, the action doing nothing for them.
- **`verbose`**, **`debug`**: the action's own entries; and at `debug`
  this boundary's steps, each with its `ms` (`train.branch`,
  `train.commit`, `train.squash`, `train.removed`).
- **`error`**: `request.failed`, where an error ends the request: the
  error, the chain of its causes, the step the action was at (the last
  event it logged), what had been done and is undone; its stack at
  `debug`. A runtime's pass that failed: `runtime.failed`.
- **`warn`**: `request.flag`, a flag that is none, or a value its flag
  does not take: ignored.
- **In a chain**: a command run here (`exec.run`) has its entries under
  its own protocol and action, and its flags hold from there on; one
  sent on (`exec.forward`) takes the flags in force with it, and the
  entries of the request it became come back with its response, each
  under its `jump`.
