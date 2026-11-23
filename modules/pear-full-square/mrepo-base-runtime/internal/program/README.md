# program

A package's program run beside an mrepo, as its own process: where its bundle is, its state read, started, ended.

What `runtime/start` and `runtime/stop` do their work with. A program is
a package's `/run` entry, its bundle's default: started as `bare
<bundle> --dir=<the mrepo's folder> --runtime=<the runtime's pid>
--state=<its state file>`.

## Signature

- `programAt(dir, path)`: the package by its path in the mrepo's folder
  (`splectral/packages/splectral/base-component-help-viewer`, `.bundle` left
  out). -> `{ path, bundle, state }`: the bundle at `<dir>/<path>.bundle`,
  its state beside it, `<dir>/<path>.state.json`.
- `stateOf(file)`: the state the program wrote.
- `launch({ bundle, dir, state, runtime, bare, wait })`: started, waited
  for until it has written its state (`wait`, ten seconds).
- `end(state, { wait })`: ended.
- `alive(pid)`: whether a process is there.

## Returns

- `programAt`: `{ path, bundle, state }`.
- `stateOf`: what the program wrote, at least `{ pid }`; `null` when none
  runs: no state, or one left by a process that is gone.
- `launch`: its state once it is up; `null` when it did not come up.
- `end`: `{ pid, how }`, `how` being `SIGTERM` or `SIGKILL`; `null` when
  none was running.

## Errors

- `programAt`: no path (`missing argument: package`); a path that leaves
  the folder, or is absolute.
- `end`: the program did not end.

## Design

- **What a program does in return**: it writes its state, whole (written
  aside, then renamed), with its `pid`, once it is up; it removes it as
  it ends; and it ends by itself when the runtime it was given has ended
  or the mrepo's folder is gone. Splectral's server is such a program.
- **Started through the shell**, in its own session: it outlives the
  request that started it.
- Its state is a file in the mrepo's folder, beside its bundle: this
  machine's, not a layer's.
