# patterns

Reads which patterns a package implements and which how-tos cover them: the implementation validation.

A pattern is a way of building that has been done before: a protocol
package, a component, a layer of its own, hooks. Each is read from a
package's files. A how-to names the pattern it covers in one line,
`Pattern: <name>`. A pattern implemented with no how-to is a problem.

## Signature

- `patternsOf(pkg, { platforms })`: the patterns a package implements,
  `[name...]`; `platforms`, the organisations the platforms declare: a
  list of one of them is that platform's component, `<org>-component`.
- `platformsOf(packages)`: the organisations the platforms among a set
  of packages declare, each in its `package.json`
  (`"platform": "<org>"`), `[org...]`.
- `howtosOf(pkg)`: its how-tos naming a pattern, `[{ pattern, howto }]`.
- `checkPatterns(packages)`: over a set of packages, `[{ check, detail }]`:
  a pattern implemented and no how-to for it, a how-to naming no known
  pattern (a platform's component pattern known once a platform among
  them declares its organisation).

## Also exported

`PATTERNS`: each pattern and what makes a package implement it; one
entry, `<org>-component`, stands for every platform's component
pattern. One is named by its how-to only, not yet read from files:
`element-set`. `componentPattern(org)`: a platform's component pattern's
name.
