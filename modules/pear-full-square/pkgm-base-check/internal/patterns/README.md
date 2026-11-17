# patterns

Reads which patterns a package implements and which how-tos cover them: the implementation validation.

A pattern is a way of building that has been done before: a protocol
package, a component, a layer of its own, hooks. Each is read from a
package's files. A how-to names the pattern it covers in one line,
`Pattern: <name>`. A pattern implemented with no how-to is a problem.

## Signature

- `patternsOf(pkg)`: the patterns a package implements, `[name...]`.
- `howtosOf(pkg)`: its how-tos naming a pattern, `[{ pattern, howto }]`.
- `checkPatterns(packages)`: over a set of packages, `[{ check, detail }]`:
  a pattern implemented and no how-to for it, a how-to naming no known
  pattern.

## Also exported

`PATTERNS`: each pattern and what makes a package implement it.
