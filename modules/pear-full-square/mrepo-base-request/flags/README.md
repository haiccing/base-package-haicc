# flags/

The flags there are, a folder each: its declaration and its page.

A flag is written after a command's URI, after `--flags` (`lib/flags.js`
reads them, and names no flag). Each is a folder of its own, everything
it needs inside, so flags are added independently: `index.js` its
declaration, this folder's `index.js` the list (`FLAGS`, by name; the
module's test fails for a folder not listed).

## Links

- [log](log/)
- [layer](layer/)
- [container](container/)
- [help](help/)
- [feedback](feedback/)
- [logical](logical/)
- [physical](physical/)

## A declaration

- `kind`: `modifier` (how the request is handled: its log), `option`
  (what an action is asked to do differently: a layer, a
  container), `rewrite` (the command it is on becomes another before
  the door: the door checks the rewritten one).
- `scope`: `chain` (holds down a chain until changed: a command sent on
  takes it with it), `step` (the step it is written on), `last` (the
  last command of a chain only: a rewrite).
- `values`: a list, a pattern its value is written to, or `null` (it
  stands alone).
- `tail`: every word after it, to the end of the command, is its value,
  joined by spaces (a `--` among them too): the last flag written. On a
  command that passes its words on, its `--` still closes it.
- A rewrite: `protocol`, the protocol its command becomes a request of,
  and `rewrite(form, value)`, the form it becomes.

## Strict

A flag that is not one, a value its flag does not take (a tail flag
with no text after it), a rewrite on a command that is not the last, a
rewrite whose protocol is not here, more than one rewrite:
nothing of the command is executed. The request completes, not failed:
its output `{ run: false, command, why }`, the reasons, each a warning
in its log (`request.flag`). The `haicc` command exits 1 for it.
