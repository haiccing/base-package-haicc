# stop

Ends the program of a package placed in the mrepo's folder, waited for until its process has ended.

The other half of `runtime/start`: a hook ends what a hook started (a
Splectral component's `stop` hook its renderer).

## Signature

`stop(exec, { args })`: requested as `runtime/stop . <path>`.

## Arguments

1. The package, by its path in the mrepo's folder, `.bundle` left out.
   Required.

## Returns

`{ stopped, ended }`: the package's path, and `{ pid, how }` (`how`
being `SIGTERM` or `SIGKILL`); `ended` is `null` when none was running.

## Errors

- No path: `missing argument: package`.
- A path that leaves the folder, or is absolute: `not a package in the
  mrepo's folder`.
- The program did not end: `its program did not end`.

## Design

- Asked to end with SIGTERM, then SIGKILL; its state file removed.
