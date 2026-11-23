# test/

The tests of mrepo-base-runtime, a section per file, each test by its name.

## `cycle.test.js`

- the cycle on p2p and on git: initialise (preloaded), start, create, read, delete, refused, stop, shutdown
- where the layers live on the p2p host: the atomic ones in the store, the rest on disk
- commission and decommission: the commission hook run after the boot, at every start (a restart runs it again, idempotent), its state in the status, waited for; a decommission asked, its lines run; a line that fails said

## `fixture.js`

Shared by the tests, not a test itself. A booted repository for the tests: the repository `host`, its layers, an empty packages manifest, its service state booted, the pending queue preloaded with service/initialise.

## `program.js`

Shared by the tests, not a test itself. A program as `runtime/start` starts one: it writes its state, removes it as it ends, ends on SIGTERM.

## `program.test.js`

- programAt: a package by its path in the mrepo's folder; nothing outside it
- lay: a placed package's runtime config into the runtime layer, its hooks; nothing else
- start and stop: a placed package's program, its own process, its state beside it, ended with its runtime

## `runtime.js`

Shared by the tests, not a test itself. The runtime from the command line, started with the crud and service protocols as packages would offer them.

## `runtime.test.js`

- version: the module and its version
- a bad call: exit 2
- the runtime: started detached, the store held, asked over its connection, stopped
