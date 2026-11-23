# test/

The tests of mrepo-base-request, a section per file, each test by its name.

## `boxes.test.js`

- post on p2p-git and on native: a record committed into the inbox layer; the folder's new files committed; nothing removed
- the setting: the p2p host by default; a repository on native git by mrepo.json

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
- a script's command: its URI where its lines run, then the lines, one argument
- flags: written after a command's URI, that step's; -- says where what follows starts
- the flag unit: a folder a flag, each listed, its declaration; what holds down a chain; strict: what keeps a command from being run
- the log: three levels of detail, info without asking; an error and a warning always
- a record: topic, key, timestamp, headers (empty), value; the onion; a form completed
- check: an internal request, the mrepo's own: not asked whether active; an action that names its states still by them

## `typed.test.js`

A request record as AVRO, the cascade: written, read back as JSON holds it; the action's own for its output when given; a node's log a topic of them.

- typed: a completed request record as AVRO, read back as JSON holds it; smaller
- typed: an error, null output, a continuation, an envelope around the core
- typed: the action's own schema for its output, when its output is valid as it; a node's log a handler
