# test/

The tests of mrepo-base-service, a section per file, each test by its name.

## `service.test.js`

- the actions: the state moved, booted to started and back
- the hooks: a transition with a hook file waits for its lines, then, resumed, moves the state; a line that failed fails it
- idempotent: a transition repeated in the state it leads to (or past it) runs its hook again, warns, the state as it is
