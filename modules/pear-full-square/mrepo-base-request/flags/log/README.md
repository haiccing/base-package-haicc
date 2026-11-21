# log

How much the request's log holds: `info` without the flag, `verbose`, `debug`.

`--flags log=verbose` keeps an action's steps, `debug` its internals
and the boundary's own steps too; errors and warnings always.

## Declaration

A `modifier`, `chain` (a command sent on keeps it until changed);
values `info`, `verbose`, `debug`.
