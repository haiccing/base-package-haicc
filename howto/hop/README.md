# hop

A command taken to another mrepo: sent on at a shortcut, once or chained.

`haicc <URI> <command>` goes to the position the URI names and executes
the command there; where the URI reaches a shortcut, the command is sent
on to the mrepo it leads to, with what is left of the URI.

## Steps

The script, [steps.haicc](steps.haicc): each line as typed after `haicc`, what it answers under it; run with `howto/run`, shown here at info extraction.

## Notes

- **`haicc` alone is `haicc/goto`**, the protocol's default action.
