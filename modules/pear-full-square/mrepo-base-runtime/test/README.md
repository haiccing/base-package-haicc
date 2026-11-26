# test/

The tests of mrepo-base-runtime, a section per file, each test by its name.

## `program.js`

Shared by the tests, not a test itself. A program as `runtime/start` starts one: it writes its state, removes it as it ends, ends on SIGTERM.

## `program.test.js`

- programAt: a package by its path in the mrepo's folder; nothing outside it
- lay: a placed package's runtime config into the runtime layer, its hooks; nothing else
- start and stop: a placed package's program, its own process, its state beside it, ended with its runtime

## `runtime.js`

Shared by the tests, not a test itself. The runtime from the command line, with no protocol of its own.

## `runtime.test.js`

- version: the module and its version
- a bad call: exit 2

## `registry.test.js`

- the registry: a type asked by its name, where the registry is; the types it names read with it; a value checked, strictly
