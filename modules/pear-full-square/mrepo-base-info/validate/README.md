# validate/

The tests every package carrying this module runs on itself: its info, on its own and where it is deployed.

## Tests

- `info.test.js`: the package's own files extracted as a runtime would,
  the package its own top, its included packages not there: every page
  reached by its menus, none against the rules.
- `info-in-situ.test.js`: the package in a running mrepo, from the info
  its runtime extracted: its pages a context of their own (the info
  split on package), reached from the top; no problem in its pages.
