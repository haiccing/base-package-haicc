# registry

The runtime's one way to a type: asked of the schema registry, by the type's name.

The runtime has one codepath for schemas (the human, 2026-11-26): a
type is asked of the schema registry by its URI, never read from a
package. The registry is where its mrepo is, `<work>/mrepos/local/avro-registry/`,
its types in its `avro` layer's folder, a file a type at its URI. The
warm boot mounts its skeleton there before any runtime starts
(`mrepo-base-warm-boot`); the schema registry component, deployed
there, takes it over: the same place, before and after.

## Signature

`registryOf(work)`: the registry of the install whose work folder this
is.

## Returns

`{ mount, type, valid }`:

- `mount`: the folder it reads.
- `type(uri)`: the type of that name (`mycelium-avro`'s), read once and
  kept; the types it refers to by name read first.
- `valid(uri, value)`: the value checked against it, strictly:
  `{ valid: true }` or `{ valid: false, problems }`.

## Errors

- A name that is no URI of a type: `not a type's name: <name>`.
- A type the registry does not hold: `unknown type: <URI>`, with where
  it looked.
- A type that refers to a name with no URI: said, with the type.

## Also exported

- `mountOf(work)`: the folder, `<work>/mrepos/local/avro-registry/avro`.
- `REGISTRY`, `LAYER`: `local/avro-registry`, `avro`.

## Design

- **Not used by the runtime yet**: what it is brought to; the request
  checked at its inbox with it is the next step.
- **The location is the contract** with what mounts it: the warm boot's
  skeleton and the registry component write a type's file at its URI;
  nothing of their code is used here.
