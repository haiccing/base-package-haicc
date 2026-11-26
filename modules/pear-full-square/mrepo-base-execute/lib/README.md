# lib/

The parts of mrepo-base-execute, a file each, imported by its `index.js`.

| file | |
|---|---|
| `changes.js` | What one commit changed against another: the paths added, changed and removed between their trees, files only, in path order. |
| `remote.js` | A command sent on: a request of its own dropped into the inbox of the mrepo a shortcut leads to, its line the command, the flags in force written into it. |
| `wait.js` | A job waited for: the request parked, what the job says written as a request returned into the mrepo's `waiting/outbox`, collected as a linked mrepo's answer. |
