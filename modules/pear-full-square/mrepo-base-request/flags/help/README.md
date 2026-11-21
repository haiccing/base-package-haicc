# help

The command it is on answered with help, not executed: it becomes `help/annotate` at the same URI.

`haicc host crud/read swarms --flags help` is `help/annotate` at
`swarms`, its arguments `crud/read` and the command's own: the command
as understood, what it does, whether the door takes it here and now,
its arguments against those its action names, the command to run it,
where to read more. Nothing of the command is executed. Answered where
the command would have run, by the `help` protocol
(`haiccing/base-package-help`).

## Declaration

A `rewrite`, `last` (on the last command of a chain only); it takes no
value; its protocol `help`.
