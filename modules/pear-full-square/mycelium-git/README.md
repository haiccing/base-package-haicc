# mycelium-git

Our git, speaking mycelium: the repository rules over a backend contract.

It reads a repository by path from the branch root, and writes changes,
plain merges and squashes under the rules. The rules code uses only the backend contract;
an adapter maps the contract onto one engine: native git, isomorphic-git,
p2p-git.

## Links

- [lib](lib/)
- [test](test/)

## Tree

Every path starts with a branch name, from the root: `/main/docs/a`,
`/request/pending/default/r1.json`. Above the branches the tree is made of
their name segments (`/request` holds `pending`, `execute`, `done`); a full
branch name is
its commit's tree. A name is never both a branch and a prefix, so this is
unambiguous. `mycelium-xpath` navigates it, `*` steps included:
`/*/*/docs/a` finds `docs/a` in every two-segment branch.

- `openRepo(backend)` → `{ select(path), read(path), find(path), node(path), children(node), bytes(node) }`
  - `select(path)` → `[path, node]` pairs; a node is
    `{ type: 'tree' | 'blob', oid }`, or `{ type: 'branches', prefix }`
    above the branches
  - `read(path)` → the content of the one file at `path`, as bytes
  - `find(path)` → the same for a file that may not be there: `null`
    when nothing is at `path`; anything else that is not one file throws,
    as `read` does
  - `node(path)`, `children(node)`, `bytes(node)` → the tree itself, for
    a query (`mycelium-xpath`'s `query`): the one node at a plain path,
    `null` when nothing is there; a node's children as `[name, node]`
    pairs, `null` for a file; a file's content
- `pinned(backend, state)` → the backend with its branches fixed to the
  commits in `state` (`{ branch: commit }`): a repository at a recorded
  state, such as a unit's
- Inside, paths are stored names and match exactly. At the boundary (the
  caller, where an external URI comes in) the URI is validated with
  `mycelium-uri`, then selected with `sameName` to find the stored names;
  `select(path, match)` and `read(path, match)` take it.

## Writing

`writer(backend)` → `{ change, merge, squash }`. Paths are inside the branch and are
stored names, valid when they come in.

- `change(branch)` → `{ put(path, bytes), remove(path), commit(message,
  { author, time }) }`. The puts and removes are committed as one
  checkpoint. A file over a folder (or the other way round), a remove of
  something missing, or a missing branch throws. Folders left empty
  disappear.
- `commitTree(branch, tree, message, { author, time })`: a checkpoint
  replacing the branch's whole tree with one whose objects are here: a
  deployment, for example.
- `merge(from, into, message, { author, time, fastForward })`: a plain
  merge commit, or nothing when `into` already holds `from`. Disjoint
  layers are never merged, and conflicts throw. `fastForward` lets `into`
  simply move to `from` when it can, for syncing an execution branch,
  never for `main`.
- `squash(from, into, message, { author, time })`: one commit on `into`
  holding what `from` changed, its only parent `into`'s head; `from`'s
  own commits do not enter `into`'s history. `from` is left as it is, as
  git's squash leaves it: removing it is its owner's. Nothing when `into`
  already holds `from`, or when `from` changed nothing in the end. Where
  `into` has not moved since `from` left it, the commit takes `from`'s
  tree; else the two are merged, and conflicts throw. Disjoint layers are
  never squashed into each other.
- `createLayer(name, message, { author, time })`: a new layer, an orphan
  branch whose first commit has an empty tree. Its first segment must be a
  layer's: `main`, `packages` and `runtime` (each on its own), `request`,
  `pending`, `overlay`, `data` or `capability` (with more segments after
  it). `execute` and `publish` branches are derived, not layers.
- `advance(name, commit)`: a branch set to a commit whose objects are
  here, forward only. An existing branch moves only to a commit that holds
  its current one in its history; a new one must start with a reserved
  segment and be a leaf.
- `importLayer(name, commit)`: a layer taken in from another repository,
  once its objects are here (`transfer`): `advance`, under the layer rules
  for a new one.
- `createExecution(target)`: `execute/<target>`, from the target's head.
- `deleteBranch(name, into)`: only once merged, with its head in `into`'s
  history. `main` and `pending/default` are permanent.
- A new name is never both a branch and a prefix: `data/sets` and
  `data/sets/more` can't both exist, nor `data` beside `data/sets`.
- Refs move only by compare-and-swap. History only grows, and a
  concurrent change fails instead of being overwritten.

## Between repositories

`transfer(from, to, commit)` copies everything a commit reaches from one
backend into another, whatever their engines, and resolves the number of
objects copied. Objects are content-addressed, so each arrives under the
same oid. One the target already has is skipped, with what it reaches.

## Two stores

`mixedBackend({ atomic, local, isLocal })` is the backend contract over
two backends: a repository's atomic layers in one (a Corestore's
Hyperdrive), its non-atomic layers in the other (git on disk), routed by
the branch's layer. `isLocal(name)`, the default routing: `request/*` and
`execute/*` on disk, every other layer atomic. Branches live in their
store and are listed together. Objects are written to the disk side; a
commit or tree written there gets what it refers to first, so the disk
side holds the whole history of what it has. When an atomic branch moves,
its commit's objects are transferred into the atomic store first (the
same ids, those there skipped), so the atomic store holds its layers whole
on its own. Reads take an object from whichever side has it; history and
merges are computed on the disk side. It passes the contract suite
(`test/mixed.test.js`).

## Bundles

`writeBundle(backend, { branch: commit })` writes a bundle as bytes, in
git's format: a header naming the refs, then a packfile of every object
they reach. It's a full bundle, with no prerequisites, and each object is
stored whole, without deltas. Native git verifies, clones and fscks it.

`readBundle(backend, bytes)` reads a bundle's objects in as loose objects,
and resolves `{ branches, objects }`. It also takes the delta-compressed
objects native git's bundles hold, against objects in the pack or already
in the backend. A bundle whose checksum doesn't match, or whose
prerequisites the backend lacks, is refused.

Both run on the backend contract, with pako for compression, so on every
engine and on Bare, p2p-git included.

## Splitting

`split(backend, commit, folder)` splits a folder out of a commit's history,
as `git subtree split` does: each commit whose folder changed becomes a
commit of the folder alone, with the original author, committer and
message. It resolves the split's head, or `null` if the folder never
existed. It runs on the backend contract, so on every engine, and gives
the same commits as native `git subtree split` (`test/split.test.js`;
checked on this repository's own history too).

## Backend contract

- Creating: `init()`, a new bare repository with `main` as its default
  branch
- Reading: `listBranches()` → `[name, commit]` pairs;
  `readCommit(oid)` → `{ tree, parents, message }`; `readTree(oid)` →
  entries `{ name, mode, type, oid }`; `readBlob(oid)` → bytes
- Raw objects: `readObject(oid)` → `{ type, object }`; `hasObject(oid)`;
  `writeObject(type, bytes)` → oid
- Writing: `writeBlob(bytes)`, `writeTree(entries)`,
  `writeCommit({ tree, parents, message, author, time })` → oid;
  `updateBranch(name, oid, expected)`, compare-and-swap (`null`: must not
  exist); `deleteBranch(name, expected)`, the same, and the folders the
  branch's name leaves empty go with it (a listing of the branches walks
  what is there)
- History and merge: `mergeBase(a, b)` → oid or `null`;
  `isAncestor(a, b)`: is `a` in `b`'s history, found from what the two
  have apart, not by walking all of `b`'s history;
  `mergeTrees(ours, theirs)` → `{ tree, conflicts }`

Adapters, one per engine, each run against the same contract suite
(`test/contract.js`):

- `nativeBackend(gitdir)`: git's plumbing, the reference
- `p2pgitBackend(gitdir, { fs })`: p2p-git, the embedded engine:
  isomorphic-git stripped to plumbing (loose objects only, no working
  tree, pluggable fs, for Bare with bare-fs or Hyperdrive). It keeps
  isomorphic-git's API, so it shares that adapter (`isoStyleBackend`).
  p2p-git (`pear-full-square/p2p-git`, at `d7d154d`) brings its own
  Hyperdrive adapter, so a repository on a Hyperdrive is
  `p2pgitBackend('/', { fs: createFs(drive) })`, with `createFs` from
  `p2p-git/hyperdrive-fs`. Opening the drive (its Corestore, its keys) is
  not this module's concern: mycelium knows nothing of p2p. The contract
  suite runs on a drive too (`test/hyperdrive.test.js`), with Corestore and
  Hyperdrive as development dependencies, for that test only.
- A tree's entries come in git's order on every engine (a folder's name
  compared as if it ended in `/`, as native git stores them): the
  isomorphic-git-style adapter sorts them so, since isomorphic-git gives
  plain name order. Found in step 3, when a report's sections came out in
  another order on Hypercore.
- `isogitBackend(gitdir, { fs })`: isomorphic-git (1.44.8) over a
  filesystem, node's by default. For compatibility: the same repository,
  read and written by an engine that also runs where native git does not.
  It has no atomic compare-and-swap, so `updateBranch` compares, then
  writes. Its merge stores the merged tree only through a real merge, so
  `mergeTrees` leaves an unreferenced merge commit, which git's garbage
  collection removes.
- The isomorphic-git-style adapter does two things itself, which native
  git does and the engines do not. A deleted branch takes the folders it
  leaves empty under `refs/heads` (up to its first segment's folder,
  which stays): the engines leave them, and their listing of the
  branches walks every folder, so it slowed with every request done.
  `isAncestor` walks both histories together, the newest commit first,
  marking which of the two reaches a commit, and ends when one reaches
  the other or only commits both reach are left: the engines' own walk
  goes through the whole history of `b` whenever `a` is not in it, which
  is what a merge asks every time. Their merge base is not used for it:
  they give the first commit both reach, not the best one.

Both run on Node and on Bare. On Bare the Node built-ins they use come from
the `bare-node-*` aliases, which are dependencies of this package; Node
ignores them, since its own built-ins come first. The Bare runtime itself
is the environment, like Node and git: installed where the module runs
(`npm install -g bare@1.36.0`), not with the module.

A commit message always ends with a newline, as git's own commits do, so
the same writes give the same oids on every engine (`test/engines.test.js`).

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the contract suite on each engine and on the mixed backend,
  the cross-engine test, on a fixture repository (bare)
