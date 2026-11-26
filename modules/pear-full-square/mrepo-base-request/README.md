# mrepo-base-request

The mrepo request protocol: it takes requests in from the inbox and moves
them through pending, execute and done.

A request arrives in a record. It is checked at the inbox against its
declared types and the mrepo's API, queued in `request/pending/default`, moved one at a time
into `request/execute`, then into `request/done`, and sent back through the
outbox. The module also holds the records, the boxes, logging, following,
and the mrepo's storage setting. The runtime runs it, one pass at a time.

## Links

- [flags](flags/)
- [lib](lib/)
- [test](test/)

## Design

The mrepo request protocol, base variant: a repository's inbox taken in,
each record
validated by its types and against its API, placed in
`request/pending/default`; the next request moved into `request/execute`; a
returned one copied into `request/done` and answered. One pass at a time,
over data states, run by the repository's runtime (`mrepo-base-runtime`).
Also the records, the boxes and the local dispatcher, and the repository's
setting.

- **A record around a request**, one level (`lib/record.js`, `record`):
  the transport's envelope, `topic`, `key`, `offset`, `timestamp`
  (a time as JSON holds one, ISO 8601), `headers` (empty for now), and its value, the request;
  each hand-over a new record, its topic the new place, around the same
  request. Their types are the runtime package's
  (`haiccing/base-package-runtime`, `types/`: `record`, `request`),
  named here by their URIs (`TYPES`).
- **A request is self-contained** (`lib/request.js`): its `command`, the
  line as typed; who asked and where its answer goes its own (`from`,
  `to`, `reply`, `origin`), whatever carries it; its `form`, the command
  as understood; its `processing` (log, metrics, what it waits for);
  what is `returned`: `done` or `failed`, and a message, natural
  language, the outcome first, a fact a line. A function a step, each
  giving a new request: `asked`, `filled`, `understood`, `noted`,
  `measured`, `returned`, `isReturned`; `unread`, what stands for
  something that came in and is no request.
- **A request's identity is its offset** (`lib/record.js`): the
  milliseconds since the epoch when it arrived at the mrepo, a number,
  never two the same there: on every record around it (`offset`), and
  its name in every layer, 13 digits (`nameOf`). One mrepo's: a request
  from another (a child's answer) gets its own here, on its record, the
  other's kept as the record's `key`.
- **The drop method** (`lib/boxes.js`): `drop(dir, uri, request)`, the one
  way anyone drops a request into an mrepo's inbox: its offset given
  under the inbox folder's lock (a streaming folder,
  `mycelium-container-document`), on the record around it,
  the file written: its offset back, the sender's confirmation.
  `answered(dir, offset)` waits for its response in the outbox folder
  under the same offset. The mrepo's own requests take their offsets
  from the same lock (`offsetOf(ctx)`, the runtime's `ctx.offset`).
- **The boxes are layers**, `inbox` and `outbox` (non-atomic): posting is a
  commit, `post(ctx, record)` (an input adding its commit: native git)
  or `post(ctx)` (the inbox folder's new records, the layer's working
  tree: what came after the layer's last); answers committed into
  `outbox`, then written into the outbox folder (`outboxOf(dir)`);
  nothing removed. An mrepo by its directory: `inboxOf(dir)`.
- **Streaming layers** (`lib/layer.js`, `STREAMS`): the `inbox`, the
  `outbox` and `request/done`, what only grows, keep a record in
  folders by its offset's digits (`/<layer>/17953/179531/<offset>.json`;
  the levels their `.layer.json`'s `structure`); pending and execute are
  flat, the same names. Declared, always: a layer streams because its
  config says its structure, never by its name; one that declares none
  is a folder. A box the runtime makes itself is made with that config
  (`ensure`, `declarationOf`). `layer(ctx, name)` reads and writes a record by
  its name alone.
- **First come, first served** (`arriving`, `POINTER`): the inbox is
  taken in past a pointer, the last record taken
  (`request/pending/default/.pointer.json`), moved in the commit that
  queues the record; none taken ahead of another. The inbox is read
  as a topic, its records after the pointer, ascending
  (`mrepo-base-xpath`'s `query`, its result iterated): only the folders from the
  pointer's on are touched. An inbox that declares no structure is a
  folder, no inbox: said.
- **A queue beside an mrepo** (`queueOf`, `keyed`): a component's side
  boxes, records taken and removed, under a key of the exchange's own:
  no stream.
- **Logs and following**: `logger(detail)` (`log(level, event, line)`: an
  entry the request type's, `time`, `level`, `event`, and what happened,
  a line;
  `error` and `warn` always kept, of `info`, `verbose`, `debug` as much
  as `detail` says, `info` by default; `level(to)` sets it from there on);
  `follow({ dir, name })` prints
  each record as it arrives in an mrepo's request layers and its children's
  in view, one compact line a record, its topic the full path; `settled()`:
  every request done (none pending or executing in any of them).
- **A request's form**: `{ protocol, action, uri, args, flags }`, the
  arguments a list of texts, unnamed, the flags a record, a field a flag. A request
  is asked as a command line, as it is typed: `<protocol>/<action> <URI>
  <argument>...`. Its line is read by the one parser (`words`, the
  shell's way; `lineOf`, words written as a line, the way back) and
  understood on its way into pending (`understood`: `read(words,
  protocols, at)`, `interpret`): the protocol alone takes its default
  action (its config's `default`). The line stays the request's
  `command`, beside its form.
- **A continuation** (`lib/record.js`: `continuationOf`, `CEILING`): a
  request's processing may hold a script
  for who asked to go on with: `{ at, script }`, shell text calling
  `haicc`, at most 64 KiB, and the position it is run for.
- **Flags** (`lib/flags.js`, the flags there are in `flags/`, a folder
  each): written after a command's URI, after
  `--flags`, space separated, a flag alone or `key=value`: that step's.
  The list runs to the end of the command, or to a `--` with its
  arguments after it. In the form a record, `flags`, a field each flag there is, each its
  own type (`typed`, `NONE`; the runtime package's `requestFlags`): one
  that stands alone a boolean, false when not written; one that takes a
  value a text, null when not written. Every function reads the map as
  written and the record the same (`chained`: those that hold down a
  chain; `carrying(words, flags, protocols)`: a command sent on, or run
  inside another, with them written into its words, at the head of its
  own list or in one of its own after its URI). After the URI of
  an action that passes its words on (its config: `command: true`) the
  list is that step's and the next command starts after the `--` that
  closes it. A list is closed by `--` or by the end of the command,
  nothing else: every word in between is a flag, but a tail flag's
  (`feedback`): every word after it, to the end of the command, is its
  text. The next command's words are left as written.
  `layer=<name>`: the layer the command's own URI is read at, `main`
  by default (`LAYER`, `layerOf`, `layerFor`); the URI of an action that
  passes on stays in `main`, a position.
  `FLAGS`: the flags there are, each its declaration (`flags/`): its
  kind, its scope, the values it takes (`log`: `info`, `verbose`,
  `debug`); `sorted(flags)`: those, and the others, each with why.
  **Strict** (`problems(form, protocols)`): a flag that is none, a value
  its flag does not take (a tail flag with no text), a rewrite on a
  command that is not the last or whose protocol is not here, more than
  one rewrite: nothing of the command is run; at the door
  the request is returned `failed`, `Not run: its flags.`, then each
  reason a line, each a warning in its log too. **A rewrite**
  (`help`, `feedback`): the command it is on becomes another request
  before the door, which checks the rewritten one (its line as typed
  still its `command`): `help` makes it `help/annotate`, `feedback`
  `haici/feedback`, at the same URI.
- **A request's URI is relative**: no leading slash, as written where
  its writer stands. `.` is the position itself, and so is none given;
  `./x` is `x`. A leading slash is refused.
- **Inside, a URI is a chain of parts, one pattern for every request**
  (the human, 2026-11-26: "to avoid having to parse repeatedly"; "it
  always starts with the mrepo layer to begin with. That is then follow
  by URI local root positions, ending in a relative end URI"; "use one
  path"): the layer first, then the local root positions gone through,
  then the URI as written, the last; kept apart, so no boundary is
  parsed again. A request stands at `main` (`STANDING`) unless a
  position or a flag says another: `host` is `["main", "host"]`, no URI
  `["main", "."]`; a command executed at a position in `main`
  (`haicc`'s `goto`) stands there: `["main", "swarms/swarm-1", "."]`;
  another layer by its flag: `["runtime", "hooks"]`. What led to this
  mrepo is not in it: forward visibility only. The mrepo's own requests
  (a hook's line) are written the same way; they differ in what they
  are allowed (any layer, not asked whether a protocol is active), not
  in their URI. Read as one URI, for a query: its parts joined
  (`joined`). The URI functions are `mycelium-uri`'s, offered here too:
  `relative`, `segmented`, `joined`, `positionOf`, `slashed`.
- **Checked by its types at the inbox** (`wrong(ctx, record)`): the
  record without its value and the request, each asked of the schema
  registry as the runtime reaches it (`ctx.registry`, `valid(uri,
  value)`), strict; what is wrong said, where. No registry: nothing is
  taken in.
- **One way into pending** (`admit(ctx, request, { origin })`): the
  inbox's requests and internal ones (`internal(ctx, command)`, the
  mrepo's own, a line or its words) pass the same handler, validated by
  where they come from; refused, the request returned `failed` in
  `request/done` (`refusal`: `Refused, nothing run.`, then why, a fact
  a line) and sent back where it names (`reply`). No mark: a request is
  internal when the inbox has no record of it (`isInternal(ctx, name)`).
  `ctx.intake === false`: the inbox not taken in yet.
- **A request begins on its own branch** (`begin`, `principals`,
  `requestBranch`): from pending straight onto
  `execute/<offset>/request/execute`, its principal; never into
  `request/execute` itself, which only receives returned requests by
  merge, on their way to done. One at a time: the next begins when no
  branch is being processed.
- **Waiting principals**: a branch not being processed has one, which says
  what it waits for (`processing.waiting`: the folder, the offset there).
  The child's answer is collected from its
  outbox folder into pending (the mrepo's own, its record's key that
  offset) and, at the front of the
  queue, added to that branch as a record of its own. Merged in with its
  principal, it goes to `request/done` and is not sent on. A response
  nobody waits for goes to `request/done`. `settled()` counts any request
  branch as not done.
- **What is missing is said** (`missing(cfg, uri, args)`): an action's
  config names what it needs, a target (`target`: the URI as written, its
  last segment, is not `.`, the mrepo itself) and its arguments (`args`, by name, `?` optional). One not
  given: `missing argument: <name>`, with or without a service, before
  the URI is looked at.
- **Checked** (`check`): its URI canonical; from outside, against the
  protocols the runtime loaded (`ctx.protocols`): the protocol loaded, the
  action configured, the URI one its config names (`matches`); and, as it
  executes, the protocol active (its file in the `protocols` layer:
  `runtimeData` reads the active set) and an action that names its states
  in one of them. Nothing is active by default. An internal request is not
  asked whether its protocol is active.
- **Hooks** (`hookOf(reader, transition)`, `hookAt`, `TRANSITIONS`,
  `lib/hooks.js`): the commands of a status transition, a file a
  transition, `/runtime/hooks/<transition>.haicc`, its lines simple
  commands run as the mrepo's own requests. The runtime fires `boot` as
  it starts, then `commission` (once: the runtime starts at a deploy
  only, the deploy waiting for it), and `decommission` when a teardown
  asks, before it is stopped; the service fires `initialise`, `start`,
  `stop`, `shutdown`.
- **A layer's records** (`layer(ctx, branch)`): one JSON document a
  record, `<name>.json`, listed in the order they arrived (the commit
  chain). A layer's config, `.layer.json` (committed with it when built from
  a structure), is not one of its records, nor is it posted from the inbox
  folder.
- **The setting** (`setting(work)`): `<work>/mrepo.json`,
  `{ "storage": "git" | "filesystem" | "p2p", "name" }` (native git;
  p2p-git with every layer on the filesystem, no Corestore; the p2p host
  over its Corestore and disk side); without it the p2p host.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): the inbox on p2p-git and native git, the pass (a request taken in, refused, the mrepo's own, an answer collected), a request's steps, a command interpreted, the check of a request (activation, state, internal), hooks and a script's lines, flags, the log, a record; each test by its name in [test/](test/).
