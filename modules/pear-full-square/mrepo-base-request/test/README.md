# test/

The tests of mrepo-base-request, a section per file, each test by its name.

## `boxes.test.js`

- the setting: the p2p host by default; a repository on native git by mrepo.json
- post on p2p-git and on native: a record committed into the inbox layer under its offset; the folder's new records committed; nothing removed

## `check.test.js`

- a URI in a request: where its writer stands; inside, an array of segments
- a command interpreted: its parts, the default action, the URI its segments
- missing: what an action's config asks for and the request does not give
- matches: a URI against a config's pattern
- check: canonical, loaded, offered there
- check: nothing is active by default; a request from outside only for an active protocol
- check: the service's own actions, each in its state
- check at the inbox: neither the activation nor the state (the queue may change them first)
- hooks: a file a transition, its lines simple commands; a script's lines, split as the shell splits them
- a line sent: a request, the mrepo's own; its offset given back beside the request returned
- a script's command: its URI where its lines run, then the lines, one argument
- flags: written after a command's URI, that step's; -- says where what follows starts
- the flag unit: a folder a flag, each listed, its declaration; what holds down a chain; strict: what keeps a command from being run
- a command sent on: the flags in force written into its line, those that hold down a chain
- the log: three levels of detail, info without asking; an error and a warning always
- a record: the transport envelope around what it carries; a continuation
- check: an internal request, the mrepo's own: not asked whether active; an action that names its states still by them

## `pass.test.js`

- a request from the inbox: checked by its types, understood from its line, queued, begun on its branch; returned: in done, sent back
- refused at the inbox: returned failed, saying why in words; in done, sent back; the next one taken in
- no schema registry: nothing is taken in
- the mrepo's own: a line or its words, written as anyone writes one; trusted, its URI and its arguments still checked; nobody waits
- a request waiting for another mrepo's answer: collected from its outbox, by the offset it has there; on the principal's branch, its key that offset

## `request.test.js`

- asked: a request as it arrives, the line as typed, who asked and where its answer goes its own
- understood: its form from its line, read by the one parser, where the writer stands; once
- filled: a request whose form came filled in, no line
- noted, measured: an entry a line, its metrics; a new request each, the one given unchanged
- returned: completed, done or failed, with what is said; its attachments by their base
