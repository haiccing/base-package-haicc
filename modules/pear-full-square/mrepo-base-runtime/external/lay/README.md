# lay

Lays the runtime config of a package placed in the mrepo's folder into its runtime layer: its hooks.

The second half of a deploy, for a platform: an mrepo deployed as any
other (the first half), a platform places a package of its own in the
mrepo's folder, and the mrepo lays that package's runtime config on top
of its own, itself: its runtime is the one writer of its layers.
Splectral's components are made so (`splectral/install`).

## Signature

`lay(exec, { args })`: requested as `runtime/lay . <path>`.

## Arguments

1. The package, by its path in the mrepo's folder, `.bundle` left out:
   `splectral/packages/splectral/base-component-help-viewer`. Required.

## Returns

`{ laid, from }`: the files laid, as the runtime layer has them
(`runtime/hooks/start.haicc`), and the package's path.

## Errors

- No path: `missing argument: package`.
- A path that leaves the folder, or is absolute: `not a package in the
  mrepo's folder`.
- No bundle there: `no package there`.
- The package brings no runtime config: `nothing to lay`.

## Design

- **What is laid**: every file of the package's `mrepo/runtime/` but the
  layer's own definition (`.layer.json`) and its pages: the hooks above
  all. A file there already is replaced, as a later package's replaces
  an earlier one's at a deploy: a package laid on top brings the hooks
  its base has not (`start`, `stop`), and replaces nothing.
- **Not an upgrade in place**: it is the second half of a deploy. A
  change is a teardown, then both halves again.
- The package is read from its bundle where the platform placed it; the
  mrepo reads no other file of the machine.
