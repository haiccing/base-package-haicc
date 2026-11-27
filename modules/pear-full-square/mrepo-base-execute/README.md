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
- **What an action answers**: `fn(exec, form)` gives what it says
  happened, natural language (the outcome first, a fact a line, names
  exact): a text, or `{ message, attachments }` where data is its
  product, each attachment its name, its type's URI and its value
  (`{ name, type, value }`), or where its value is (`{ name, type, at }`).
  A value is written as the wrapper, its content the value's bytes by
  its type, by the types the mrepo holds, while the request can still
  fail whole: one that does not fit, or of a type not held, fails it
  (`not attached: <name> (<type>)`, then why). The request is returned
  `done` with it. An action that says
  nothing fails its request; what it throws fails it too: `Failed,
  nothing of it kept.`, its message, its causes a line each. Refused as
  it executes (the check, an action there is none of): `Refused, nothing
  run.`, as at the door.
- **A job waited for** (`exec.wait(job)`, `lib/wait.js`): an action
  parks its request until an outside job, an async function, ends; its
  writes so far are dropped, the runtime is free meanwhile. What the job
  says (as an action says it; what it throws: failed) is written as a
  request returned into the mrepo's own `waiting/outbox` under an offset
  of the mrepo's, collected as a linked mrepo's answer is, and the
  action executed again with it: `exec.resumed`, `{ status, message,
  attachments }`, its attachments as values. One wait a request.
- **A command sent on** (`exec.forward(to, command)`, `lib/remote.js`): an
  action that finds its position a shortcut sends the command that follows
  to the mrepo linked there, a request of its own dropped into its inbox
  folder: its line the command, the flags in force that hold down a
  chain written into it; its answer for this request's branch (`reply`),
  its `origin` this request's offset. Nothing of the request is executed
  here; its processing ends: what it waits for is said on it
  (`processing.waiting`). A request branch not being processed has a
  waiting principal. Once the request protocol has added the other
  mrepo's answer to the branch, the principal is returned with it here:
  what was returned there its own. What happened to it there is not
  copied: the request it became is linked (`processing.sent`: the
  position, the mrepo's unique URI, its offset there), found in that
  mrepo's `request/done`.
- **A continuation** (`exec.continuation(script, at)`): an action
  answers, beside what it says, with a script for who asked to go on with
  (`processing.continuation`):
  shell text calling `haicc`, and the position in this mrepo it is run
  for. One a request, at most 64 KiB; none when it failed. Not run here:
  the terminal runs it with `sh`. One that comes back from a linked mrepo is returned
  with the answer, its position behind the one the command was sent
  on at.
- **What is not there is said with what is**: `no protocol: <name>`, with
  the mrepo's protocols; `no action: <protocol> <action>`, with the
  protocol's actions.
- **A command executed here** (`exec.run(command, { own })`): a line or its
  words, the flags in force written into it, understood, checked as the
  request itself is, its action run in the same execution; what it says
  returned (`{ message, attachments }`, its attachments as values; one of
  a type not held here the wrapper as it is, to pass on, its `value`
  refused). `own`: as the mrepo's own, not held
  at the door; the service runs its hooks so.

The mrepo execute protocol, base variant: a request in `request/execute`
executed in execution
branches made from their targets (`execute/main`, `execute/runtime`,
`execute/request/execute`), its action run inside the execution context
(read-only to it: the targets read overlaid, the execution branches written,
the runtime's context read through `exec.runtime`; the request's id,
`exec.id`, its record's offset, its name in `request/done` once done), the
request returned,
each branch squashed into its own target. `executed(ctx, name, record)`
hands over a request returned elsewhere the same way (the boot's own request).
Run by the repository's runtime
(`mrepo-base-runtime`). It has no actions of its own: they are the
mrepo's packages'; its tests run it with actions of their own. An
action writes the targets the mrepo has: `main`, `runtime`, `info`,
`protocols`, `links`. A path it reads or writes by is given relative from the
mrepo's root (`runtime/service.json`) or slash-led, the same.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): a request executed: its branches and their squash, returned done or failed, what it changed and its metrics, its log; refused as it executes; a command run in it; sent on and returned with the answer; a job waited for; `executed`, `failed`; each test by its name in [test/](test/).

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
dropped), `rollback()` (the last local commit undone), `log(level, event, line)`
(an entry in the request's own log, under the action's protocol and
action: what happened, a line), `step(event, line, fn)` (a step of the
action run and measured here: its entry at `verbose`, its line, then what
it took and what it read and wrote meanwhile; `line` a text, or a function
of `fn`'s result), `reset()`
(everything of this execution
ditched, back to the start), the action going on; global, the runtime's,
not the action's: when the action ends, its writes committed and the
execution branches squashed into their targets, once; a failure resets.

## The request's processing

What happened to a request on its way, made here, at the boundary, for
every request, whatever its action does. A fact once: what has a field is
not said in a line beside it.

- **`metrics`**: how long it took, what it read and wrote (`ms`,
  `reads`, `selects`, `puts`, `removes`, `commits`), counted here, the
  action doing nothing for them.
- **`changed`**: what it changed, a target each: the paths added,
  changed and removed, from the two trees; the first hundred of a target
  (`LISTED`), beyond them said in its log (`request.changed`).
- **`waiting`**, **`sent`**: what it waits for, sent on or parked; the
  request it became where it was sent on, a link.
- **`log`**: its entries, a line each (`time`, `level`, `event`,
  `line`). How much is kept is the request's flag,
  `log=info|verbose|debug`; `info` without it. An error and a warning
  are always kept.
  - `verbose`, `debug`: the action's own entries; and at `debug` this
    boundary's steps, each with what it took (`train.branch`,
    `train.commit`, `train.squash`, `train.removed`).
  - `error`: `request.failed`, where an error ends the request: the
    error, the step the action was at (the last event it logged), its
    causes, what is undone; its stack at `debug`. A runtime's pass that
    failed: `runtime.failed`.
- **In a chain**: a command run here (`exec.run`) has its entries under
  its own protocol and action, and its flags hold from there on; one
  sent on (`exec.forward`) takes the flags in force with it, in its
  line; the entries of the request it became are that request's own,
  there.
- **The physical log** (`xpath/log`): not written for now: a step's
  line holds no query to keep; back when xpath is brought to the
  request.
