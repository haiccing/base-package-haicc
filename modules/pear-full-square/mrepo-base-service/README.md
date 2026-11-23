# mrepo-base-service

The mrepo service protocol: the service state of an mrepo's external API, and the actions that move it.

The state is in the runtime layer, `/runtime/service.json`: every mrepo
has it (the boot mrepo, the root, the one exception). Each action is
allowed only in the states its config names (another refused, `not
now`); it runs the hooks of its transition, the lines of
`/runtime/hooks/<transition>.haicc`, in its own execution, then moves
the state. A hook that fails fails the transition. Stopped or shut
down, the mrepo's runtime runs on: only a teardown stops it. Offered by
`haiccing/base-package-service`.

## Links

- [external](external/)
- [test](test/)

## States

`booted` → `initialise` → `initialised` → `start` → `started`; back with
`stop` and `shutdown`.

## Hooks

`transition(exec, name, state, done, form)`, in `internal/state.js`: the
hook file of `initialise`, `start`, `stop` or `shutdown`, its lines run
in turn, logged in the request when it resumes. What the door opens and
closes is two of them: a `start` line that activates a protocol, a
`stop` line that deactivates it.

A transition's hook file, `/runtime/hooks/<transition>.haicc`, is lines
of simple commands: the transition waits for them (`exec.wait`), each
run as the mrepo's own internal request, one after the other, the
runtime free meanwhile; then the request is resumed and the state moved.
A line that fails fails the transition: the state stays.

## Answers

Each action answers what was done and the state now: `{ service, state }`.
`stop` answers `stopped` with the state `initialised`; `shutdown` answers
`shut down` with the state `booted`.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the actions on a context written for it.
