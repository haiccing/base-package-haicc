# mycelium-uri

Our URIs: parse, validate, and split at known prefixes.

Generic: no git, no dependencies. A URI is absolute and `/`-separated,
without scheme, query or fragment; its canonical form is lowercase. A
URI in a request is relative: the same segments, no leading slash.

## Links

- [lib](lib/)
- [test](test/)

## Design

The rules a URI follows are the base family's URI documentation
(`haiccing/base-docs-uri`). Here, how they are kept: one validator, at
the boundary, for names and URIs alike; a URI in any case finds external
content through the boundary's lookup (`sameName`), the canonical form
lowercase.

## API

Validation is at the boundary: `validate` where a URI comes in. The other
functions work on valid values and don't check again.

- `validate(uri)` → the canonical URI. Fixes accepted deviations and
  throws when the rules are broken. The accepted deviations are uppercase,
  which folds to lowercase, and empty parts: `//` and a trailing `/`;
  `''` is the root. So `validate('/Main//README.md/')` →
  `'/main/readme.md'`. With `{ star: true }` a step
  may also be `*`, for paths that select
- `sameName(name, step)` → boolean: is a stored name the one a canonical
  step names (case-insensitive). For the boundary only: it finds the
  stored names of an external URI once; inside, stored names match exactly
- `isUri(uri)` → boolean: is it a canonical URI
- `isSegment(s)` → boolean
- `isHidden(s)` → boolean: a name starting with a dot, no URI's: what a
  container keeps beside its data. `HIDDEN`: the ones there are, in one
  place: `.layer.json`, `.node.json`, `.shortcuts.json`, `.lock`,
  `.pointer.json`
- `parse(uri)` → segments: `'/a/b'` → `['a', 'b']`, `'/'` → `[]`. Strict:
  it throws on anything not canonical, naming the canonical form
- `format(segments)` → uri
- `join(uri, ...parts)` → uri; a part may hold several segments (`a/b`)
- `parent(uri)` → uri; throws for the root
- `split(uri, branches)` → `{ branch, path }`, where `branches` is any
  iterable of branch names. Throws when no branch matches, or when more
  than one does (the rule that no name is both a branch and a prefix is
  broken)

## Not instrumented

The functions are pure: their result depends only on their arguments. A
run records the invocation of the unit they are part of, and a rerun
reproduces every call inside it.

## Tests

- `brittle-bare test/*.test.js` (Bare installed): names and data names, a URI validated, parsed and formatted, joined and split, relative URIs and their filters, a URI as data; each test by its name in [test/](test/).

## Relative

How a URI is written, relative, its parts, a part that selects, data
names: the base family's URI documentation (`haiccing/base-docs-uri`).
Here, the functions.

- `relative(uri)` → its canonical form. Throws on a leading slash, saying
  the URI as it is written now, on a segment that is not a name, and on a
  form that is not canonical.
- A part may be `*`, for a URI that selects, and may carry filters,
  `[...]`: a query, read by `mycelium-xpath`. A part's name is checked as
  any name part; a filter is kept as written, and checked for its
  brackets and quotes and for the URI's own rule: what is no quoted
  value in it is lowercase, as a name part is (`public-key`, not
  `publicKey`). A filter without a name filters the position itself, in front
  only: `[state='started']`.
- `stepsOf(uri)` → its parts, split at the slashes outside filters, a
  filter with its part: `a/*[x='b/c']/d` gives `a`, `*[x='b/c']`, `d`.
- `selects(uri)` → whether it selects: a part that is `*`, or a filter.
- `from(at, uri)` → the URI written at a position, from that position's
  start: `from('main', 'host')` is `main/host`.
- `within(at, uri)` → the other way: `host`; `.` for the position itself;
  `null` when the URI is not at or below it.
- `slashed(uri)`, `unslashed(path)` → to and from the slash-led paths the
  code still reads and writes by: `.` is `/`.
- `ROOT`: `.`.

## Segments

A URI as data is an array of segments, each a relative URI of one or more
name parts: `["main", "host"]`, `["main", "swarms/swarm-1"]`. The
segments are the fixed chunks it is made of: a prefix, then the URI as it
was written. A string is how one segment is written.

- `segmented(uri)` → the array, checked: at least one segment, each a
  relative URI in its canonical form.
- `joined(uri)` → the one relative URI the segments make: `main/host`;
  `["main", "."]` is `main`.
- `positionOf(uri)` → its segments without those that are `.`: where it
  points, as the prefix for what is written there.
