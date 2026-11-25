# script

Several commands run as one: a script's lines, each a simple command, executed where the haicc points.

`haicc/script` is a command like any, its URI where the lines run (`.`
where the `haicc` points), its argument the lines: a shell multi-line
string, or a heredoc on stdin. Each line runs as if typed at that
position, after the one before; the first that fails ends it, saying
which. One launch of the `haicc` command for all of them.

## Steps

The script, [steps.haicc](steps.haicc): each line as typed after `haicc`, what it answers under it; run with `howto/run`, shown here at info extraction.

## At the terminal

What only the `haicc` command does, around the steps: lines on several
lines, a heredoc, a script kept in the install.

```sh
# several lines in one argument: a shell multi-line string
haicc host haicc/script . '
service/stop
service/start
crud/read .
'
# a heredoc: a line that holds JSON keeps its quotes
haicc host haicc/script . <<'END'
crud/create swarms/swarm-2 '{"kind":"swarm"}'
boot/deploy swarms/swarm-2/node-1 haiccing/base-component-haicc
END
# a script kept in the install, by its name: <home>/scripts/check.haicc
# (the folder is yours to make: mkdir -p ~/.haicc/scripts)
haicc host haicc/file . check
# what the install keeps
haicc scripts
```

## Notes

- **Each line its own request**, recorded; a line that hops (`haicc
  node-1 ...`) is a hop like any.
- **No variables, no logic**: the position is the input; a script
  written relative to where it runs is run elsewhere by pointing there.
- **The install's scripts** (`haicc/file`): `<home>/scripts/<name>.haicc`,
  a package's at `<org>/<package>/<name>.haicc`; read by the terminal,
  sent as `haicc/script`. A name, never a path. The folder is the user's
  to make and fill: nothing installs a package's scripts there yet (a
  package's own scripts are sent from its folder,
  `haicc . haicc/script <position> < <its scripts/<name>.haicc>`).
