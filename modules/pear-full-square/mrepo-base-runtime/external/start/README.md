# start

Starts the program of a package placed in the mrepo's folder, as its own process, ended with the runtime.

A program is a package's `/run` entry. `runtime/run` runs a package's
entries inside the runtime's process and refuses `/run`; this is its
complement: the program beside the mrepo, a process of its own. A hook
starts one: a Splectral component's `start` hook its renderer.

## Signature

`start(exec, { args })`: requested as `runtime/start . <path>`.

## Arguments

1. The package, by its path in the mrepo's folder, `.bundle` left out:
   `splectral/packages/splectral/base-component-help-viewer`. Required.

## Returns

`{ started, state }`: the package's path and the state its program wrote
(its `pid`, and what else it says). Running already: `{ started,
already: true, state }`, left as it is.

## Errors

- No path: `missing argument: package`.
- A path that leaves the folder, or is absolute: `not a package in the
  mrepo's folder`.
- No bundle there: `no package there`.
- The program wrote no state within ten seconds: `its program did not
  start`.

## Design

- **Started** as `bare <bundle> --dir=<the mrepo's folder>
  --runtime=<the runtime's pid> --state=<file>`, through the shell, in
  its own session: it outlives the request (`internal/program`).
- **Its state** is `<path>.state.json` in the mrepo's folder, beside its
  bundle, written by the program once it is up.
- **What the program does in return**: its state written, whole, with its
  `pid`; removed as it ends; and it ends by itself with the runtime it
  was given, or when the mrepo's folder is gone: a teardown leaves no
  program running.
