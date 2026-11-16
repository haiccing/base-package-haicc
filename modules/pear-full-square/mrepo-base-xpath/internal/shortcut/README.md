# shortcut

Says where a node's sources are recorded and where a shortcut leads.

A shortcut is a node whose data originates elsewhere: another mrepo, linked
at that position. Its sources are in `main`, beside its node's document,
in `.shortcuts.json`. Only the mrepo that owns a shortcut knows it is
one.

## Signature

`linkOf(exec, position, entry)`, async: `position` as written at `main`
(`host`); `entry` one of its sources, `{ mrepo }`; `exec` reads the
registry (`exec.find`) and names this mrepo's folder (`exec.runtime.dir`).

## Returns

The shortcut as a command is sent on to it:

```
{ at, mrepo, ..., folder, dir }
```

- `mrepo`: the linked mrepo's unique URI.
- `folder`: its folder, relative to this mrepo's, as its entry in the
  registry says it (`../local/host`); `null` when the registry has none.
- `dir`: the same, absolute, when the context names this mrepo's folder.

## Design

- **Where it leads is read from the registry**, a layer of the mrepo
  that deploys: an entry an mrepo it deployed, a node by that mrepo's
  unique URI (`registry/local/host`), saying where it is on this
  machine. No entry: not reachable from here.
- **Only the link in main.** A shortcut is a node with a list of its
  sources; one is in use for now, the first.
- **Own shortcuts only.** An mrepo knows its own. Those of a linked
  mrepo are not visible from here.

## Also exported

- `shortcutOf(position)`: the list's path, `main/<position>/.shortcuts.json`,
  for a position as written at `main`. `SHORTCUTS`: the file's name.
- `shortcutsAt(exec, position)`: the sources recorded there, `[]` when
  it has none.
- `MAIN`: `main`, the layer positions are in.
- `REGISTRY`: `registry`, the layer. `entryOf(uri)`: an mrepo's entry
  there, `registry/<swarm>/<name>/.node.json`. `registered(exec, uri)`:
  the entry, `null` when there is none. `NODE`: `.node.json`.
- `IDENTITY`: `/runtime/mrepo.json`, an mrepo's own `{ uri }`.
- `swarmOf(uri)`: the swarm of a unique URI, `local` when it has none.
- `uriOf(parent, name)`: the unique URI of an mrepo linked at a name, in
  its parent's swarm.
