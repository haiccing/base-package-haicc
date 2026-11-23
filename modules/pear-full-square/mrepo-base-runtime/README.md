# mrepo-base-runtime

The mrepo runtime: the always-on process that runs an mrepo's protocols.

It holds the mrepo's store as its single writer, serves its local connection
(`status`, `stop`, `decommission`), and fires the protocols in turn over their data states.
Before the mrepo is operational, it places its own requests, such as
its help's extraction, and takes none from the inbox. Its own package offers the `runtime`
protocol.
Other protocols come from the linked packages. It is started from the
mrepo's own packages: `bare
<dir>/packages/haiccing/base-package-runtime.bundle <dir>`.

## Links

- [external](external/)
- [internal](internal/)
- [test](test/)

## Design

- `index.js`: the library. No protocol is built in: every action comes
  from a package. `test/runtime.js`: a command line for the tests, started
  with `crud` and `service` as packages would offer them.
- The protocols its linked packages offer (`protocolsOf`): each package
  in its `packages` layer with a `protocol` entry, imported from its
  `packages/` (the bundle's dispatcher, `run('/protocol')`: nothing else
  runs on import): its actions, and its configs, which the check reads
  (`ctx.protocols`).
- Boot: the protocol protocol opened by the runtime itself, its own
  request; then its boot hook file, `/runtime/hooks/boot.haicc`, a line a
  request of its own (internal, standing at `main`), one after the
  other; until they are done it takes nothing else from the inbox. The
  runtime names no other protocol: what is activated at boot is the
  hook's (the activations only: an mrepo's setup is its service's
  `initialise`).
- **Commission**: after the boot hook, its `commission` hook,
  `/runtime/hooks/commission.haicc`, the same way, its lines the mrepo's
  own: what the mrepo does once deployed, as its package says (its
  components deployed, each commissioned by its own; its service
  initialised, started). At every start: the runtime starts at a deploy
  and stops at a teardown, and a runtime started again (a restart, a
  replica's with its container) runs it again; its lines are idempotent
  (`base-docs-hdlc`, "Every action is idempotent"): a deploy of what is
  there is a warning, a service in its state already runs its hook again.
  Nothing records it. Its state in the status, `commission`:
  `none` (no hook), `pending`, `running`, `done`, `failed` with the line
  that failed and why; the inbox is open while it runs.
- **Decommission**: asked over its connection (`decommission`) by a
  teardown, before it stops the runtime: its `decommission` hook's lines
  run, the answer when they are done (`{ ok, decommission: none | done }`,
  or `{ ok: false, error }`, the line that failed).
- A line of a hook, the mrepo's own (`ctx.own`): queued, placed by the
  next pass as an internal request, its completed form waited for in
  `request/done`.
- Its unique URI, `<swarm>/<node>`, a path, read from its runtime layer
  (`/runtime/mrepo.json`) as it starts; its name where it has none. It is
  how the mrepo is addressed: its inbox's topic, its requests'. In its
  status: `repository.uri`.
- Its own package's protocols, passed in by its `run.js` (`run({ own })`;
  its bundle not imported again): `runtime run`, the method `external/run/`.
  `runtime/run .
  packages/<org>/<package><target> [dry-run]`: a linked package's
  entry through its dispatcher, its tests above all (a floating instance of
  the package, each unit its own process); the result the request's output,
  a line a unit in its log. `/protocol`, `/deploy`: the names offered.
  `/run` refused (a package's program, not run inside the runtime).
  `runtime/start . <path>` and `runtime/stop . <path>`: a package's
  program beside the mrepo, its own process, ended with the runtime
  (`internal/program`); `runtime/lay . <path>`: a package's runtime
  config, its hooks, laid into the runtime layer: the second half of a
  deploy, for a platform (`<path>` a package placed in the mrepo's
  folder, by its path there). Without `service` (no `runtime/service.json`): no
  gate, and the runtime keeps running until stopped.
- An mrepo by its directory (`run({ repo })`, as `ask`, `start`, `open`):
  `<work>/mrepos/<name>`, on the filesystem storage, its socket
  `<repo>/runtime.sock`, else (too long for a Unix socket: nested children)
  a short path in the temporary folder named by the directory's hash
  (several mrepos in one work folder); its own folder its working place
  (`dir`: its inbox folder, its packages); started from
  its own `packages/` (`start({ repo })`: `bare <repo>/packages/haiccing/
  base-package-runtime.bundle <repo>`).
- Its repository opened by the setting beside it (`<work>/mrepo.json`):
  `git`, a standalone repository on native git (`<work>/mrepos/<name>/.git`,
  bare); `filesystem`, p2p-git's hybrid with every layer on the filesystem (the same
  folder, no Corestore: the boot mrepo); `p2p` (the default), the host's
  repository over its Corestore and disk side. The same protocols on all.
- A pass fires the protocols in turn over their data states: on the
  p2p host (and on `filesystem`) the inbox folder's new files committed, the request protocol (`mrepo-base-request`), the
  execute protocol (`mrepo-base-execute`). It runs until it is stopped: a parent's teardown
  stops its child's.
- **A pass is made when something arrives**, not on a clock. The inbox
  folder is watched, and so is the outbox folder of each linked mrepo a
  request here waits for: a file written there wakes a pass. A pass that
  moved something (a branch's head changed) is followed by the next at
  once. Nothing moving and nothing arriving: nothing is listed, but for
  a slow look, the net for an event missed (`idle`, 2 s). A folder that
  cannot be watched, and a `git` repository, whose inbox is a layer
  written by others, are looked at as before, every `every` (200 ms).
- **A pass that runs on is said**: one still running after a minute is
  reported once, on stderr and in the mrepo's folder,
  `runtime-stall.json`: the step it is at (`heads`, `post`, `intake`,
  `own`, `request`, `execute`, `request again`, `heads again`,
  `waiting`, `failed`) and since when. Until it ends, no other pass is
  made: the inbox is not taken in.
- `stop({ repo, pid })`: a runtime ended, waited for until its process has
  ended: asked over its connection, then SIGTERM, then SIGKILL. Used by a
  parent's teardown and by the `haicc` app's.
- `commissioned({ repo })`: its commission waited for, as its status says
  it, until it is done or failed (or the runtime gone: `null`), bounded
  (`wait`, 30 minutes); a parent's deploy waits on it.
  `decommission({ repo })`: its decommission asked and waited for; a
  parent's teardown runs it before `stop`.
- `test/fixture.js`: a booted host, for the tests.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the cycle on p2p and on git, from the preloaded initialise to the shutdown; where the layers live; the runtime from the command line, started detached, asked over its connection, stopped; each test by its name in [test/](test/).
