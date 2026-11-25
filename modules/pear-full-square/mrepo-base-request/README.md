# mrepo-base-request

The mrepo request protocol: it takes requests in from the inbox and moves
them through pending, execute and done.

A request is a record. It is checked at the inbox against the mrepo's API
and service state, queued in `request/pending/default`, moved one at a time
into `request/execute`, then into `request/done`, and sent back through the
outbox. The module also holds the records, the boxes, logging, following,
and the mrepo's storage setting. The runtime runs it, one pass at a time.

## Links

- [flags](flags/)
- [lib](lib/)
- [schemas](schemas/)
- [test](test/)

## Design

The mrepo request protocol, base variant: a repository's inbox taken in,
each message (a record)
validated against its API and its service state, placed in
`request/pending/default`; the next request moved into `request/execute`; a
completed one copied into `request/done` and answered. One pass at a time,
over data states, run by the repository's runtime (`mrepo-base-runtime`).
Also the records, the boxes and the local dispatcher, and the repository's
setting.

- **Records are an onion**: the core (the pre-filled form: its topic where
  it is to arrive back, its value the request) in an envelope (its topic
  the destination); each hand-over replaces the envelope; execution
  completes the form (`output` or `error`); the completed form is sent back
  into the outbox, in an envelope. Headers empty for now.
- **A request's identity is its offset** (`lib/record.js`): the
  milliseconds since the epoch when it arrived at the mrepo, a number,
  never two the same there: on its record and every envelope around it
  (`offset`), and its name in every layer, 13 digits (`nameOf`). One
  mrepo's: a record from another (a child's response) gets its own
  here, on its envelope, and keeps the other's on its core.
- **The drop method** (`lib/boxes.js`): `drop(dir, uri, core)`, the one
  way anyone drops a record into an mrepo's inbox: its offset given
  under the inbox folder's lock (a streaming folder,
  `mycelium-container-document`), stamped on the core and its envelope,
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
- **Logs and following**: `logger(detail)` (`log(level, event, data)`;
  `error` and `warn` always kept, of `info`, `verbose`, `debug` as much
  as `detail` says, `info` by default; `level(to)` sets it from there on;
  the entries into the completed form, `complete(core, result,
  entries)`); `follow({ dir, name })` prints
  each record as it arrives in an mrepo's request layers and its children's
  in view, one compact line a record, its topic the full path; `settled()`:
  every request done (none pending or executing in any of them).
- **Typed records** (`lib/typed.js`, `schemas/request.json`): a record
  as AVRO, the cascade (`mycelium-value-avro`): the record, its value
  the form completed (`request`: what it asked, then its output or its
  error, its log; the form's other fields in `more`), in that its
  arguments and its output, single-object encoded, the action's own
  schema when given and valid, else `json`; an envelope a level more.
  `encodeRecord(reg, record, { args, output })`, `decodeRecord(reg,
  bytes)`, back as JSON holds it; `logHandler(reg, opts)`, the value
  handler for a topic of records, a node's log. The request layers, the
  inbox and the outbox stay JSON.
- **A request's form**: `{ protocol, action, uri, args }`, the arguments a
  list, unnamed. A request may also be given as a command, as it is typed:
  its parts in order, `<protocol>/<action> <URI> <argument>...`, an array
  or a string (`{ command }`, or the value itself). It is interpreted on
  its way into pending (`interpret(command, protocols, at)`, `formOf`):
  the protocol alone takes its default action (its config's `default`).
  The command stays in the form, beside what it was interpreted as.
- **A continuation** (`lib/record.js`: `continuationOf`, `CEILING`,
  `complete`): a completed form may hold, beside its output, a script
  for who asked to go on with: `{ at, script }`, shell text calling
  `haicc`, at most 64 KiB, and the position it is run for.
- **Flags** (`lib/flags.js`, the flags there are in `flags/`, a folder
  each): written after a command's URI, after
  `--flags`, space separated, a flag alone or `key=value`: that step's.
  The list runs to the end of the command, or to a `--` with its
  arguments after it. In the form a map, `flags`, there only when one
  was written or came with the request (a command sent on brings the
  sender's flags that hold down a chain, `chained`: such a flag holds
  until changed). After the URI of
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
  the request completes, not failed, its output `{ run: false, command,
  why }` (`notRun`), each reason a warning in its log. **A rewrite**
  (`help`, `feedback`): the command it is on becomes another request
  before the door, which checks the rewritten one (`rewritten` in the
  form says which flag): `help` makes it `help/annotate`, `feedback`
  `haici/feedback`, at the same URI.
- **A request's URI is relative**: no leading slash, as written where
  its writer stands. `.` is the position itself, and so is none given;
  `./x` is `x`. From outside the writer stands at `main` (`MAIN`), so the
  outside reaches `main` only; the mrepo's own requests, a hook, stand at
  its root and name the layer first. A leading slash is refused.
- **Inside, a URI is an array of segments**: in the form, the prefix
  where the writer stands, then the URI as written. From outside
  (`OUTSIDE`) that is the prefix `main` and one segment: `host` is
  `["main", "host"]`, no URI `["main", "."]`; a command executed at a
  position in `main` (`haicc`'s `goto`) stands there, the position a
  segment between: `["main", "swarms/swarm-1", "."]`. The mrepo's own (`OWN`)
  have no prefix: `["."]`, `["runtime/hooks"]`. Outside, a URI is one
  segment, as it is written: a form given filled in carries it so. The
  URI functions are `mycelium-uri`'s, offered here too: `relative`,
  `segmented`, `joined`, `positionOf`, `slashed`.
- **One way into pending** (`admit(ctx, core, { origin })`): the inbox's
  records and internal requests (`internal(ctx, form)`, the mrepo's own)
  pass the same handler, validated by where they come from; refused, the
  form completed with the error in `request/done`. No mark: a request is
  internal when the inbox has no record of it (`isInternal(ctx, name)`).
  `ctx.intake === false`: the inbox not taken in yet.
- **A request begins on its own branch** (`begin`, `principals`,
  `requestBranch`): from pending straight onto
  `execute/<offset>/request/execute`, its principal; never into
  `request/execute` itself, which only receives completed requests by
  merge, on their way to done. One at a time: the next begins when no
  branch is being processed.
- **Waiting principals**: a branch not being processed has one, which says
  which child it waits for. The child's response is collected from its
  outbox folder into pending (the mrepo's own) and, at the front of the
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

- `brittle-bare test/*.test.js` (Bare installed): the inbox on p2p-git and native git, a command interpreted, the check of a request (activation, state, internal), hooks and a script's lines, flags, the log, a record; each test by its name in [test/](test/).
