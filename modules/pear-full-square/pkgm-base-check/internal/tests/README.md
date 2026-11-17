# tests

A module's test page against its tests: what `test/README.md` says is
tested is what is.

The page has a section a file of `test/` that declares tests,
`## \`<file>\``, and in it each test of that file by its name, a `- `
entry; an entry may run on over indented lines. A name written as a
template is a pattern: what is in `${...}` stands for any text, and a
leading `${...}: ` may be left out, for a suite run under several names;
such a test may have several entries, one for each name it runs under.

## Signature

- `checkTestPage(mod)`: a module's folder, `[{ check, file, detail }]`:
  the page not there, a file with no section, a section with no file, a
  test not listed, an entry that is no test.
- `testNames(text)`: the tests a file declares, `[{ name, pattern }]`,
  pattern a RegExp for a template name, else null.
- `pageSections(text)`: a test page read, `{ [file]: [entry...] }`.
