# feedback

Feedback on the command it is on, recorded, the command not executed: it becomes `haici/feedback` at the same URI.

`haicc host crud/read swarms --flags feedback the list is empty, a
swarm was expected` is `haici/feedback` at `swarms`, its arguments the
text (`the list is empty, a swarm was expected`), then `crud/read` and
the command's own. Feedback can be given on anything that exists as a
command. Nothing of the command is executed; the feedback is recorded
where the command would have run, by the `haici` protocol
(`haiccing/base-package-haici`): its request's record is the store,
read back with `layer=request`.

## Declaration

A `rewrite`, `last` (on the last command of a chain only); a `tail`:
every word after it, to the end of the command, is its text (a `--`
among them too), so it is the last flag written. Written with no text
after it, it is refused. Its protocol `haici`.
