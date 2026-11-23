# test/

The tests of mrepo-base-execute, a section per file, each test by its name.

## `execute.test.js`

- execute: execution branches from their targets, the record completed, squashed into each target
- the execution context: read-only to the action, the runtime's context read through it
- local commit and rollback in an action; the global commit at its end, a failure rolling back globally
- the request's log: info unasked (its audit, its metrics), the action's entries under its name, as much as its flag asks
- a step of an action: measured at the boundary, what it took and what it read and wrote; a file that may not be there
- an error ends a request at the boundary: what stopped it, its causes, the step it was at, what was undone
- a command run in the execution: its entries under its own name, its flags in force from there on
- executed: a form completed elsewhere handed over as execute hands one; a runtime merging it first: found done
- failed: a runtime's error in the request executing
- exec.run: a command executed here; exec.continuation: a script answered with the output; exec.forward: sent on, the principal waiting, returned with the response
