# mrepo-base-protocol

The mrepo protocol protocol: activating and deactivating the protocols an mrepo offers to the outside.

A request from outside is accepted only for a protocol that is active, and
nothing is active by default. The active set is the `protocols` layer, one
file a protocol. These two actions write and remove those files; the hooks
of an mrepo's status transitions call them. Offered by
`haiccing/base-package-protocol`.

## Links

- [external](external/)
- [test](test/)

## Examples

```
["protocol/activate", ".", "help"]       a boot hook: always open
["protocol/activate", ".", "boot"]       a start hook: behind the door
["protocol/deactivate", ".", "boot"]     a stop hook
```

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the actions on a context written for it.
