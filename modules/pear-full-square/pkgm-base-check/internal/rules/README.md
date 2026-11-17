# rules

Checks a module of ours, or a package's own code, against the code rules.

## Signature

- `checkModule(dir, { ours })`: a module's folder; `ours`, our modules'
  names.
- `checkPackage(dir)`: a package's own code, its `modules/` aside: the
  references only, as it reaches its modules by path.

## Returns

`[{ file, check, detail }]`; none expected. `check` is one of:

| check | |
|---|---|
| `structure` | a method directory has its `index.js` and its README |
| `imports` | an import stays in its module, or names another module |
| `transient` | no reference to a development repository: its notes, a link to it (`dev-env-<n>`) |
| `console` | nothing printed; a print that is meant says why |
| `catch` | an error caught is used; one taken without looking says what is expected |
| `cause` | an error thrown in a catch carries the one caught |
| `logging` | a function handed the execution context logs, or says where its entries are, or why it has none; a level written is one there is |
| `request` | what is the request's is not done by an action: no time taken, no failure returned as a value, no entry of the boundary's kind |

The last five are read from a module's own code, its tests aside (`test/`,
`validate/`, `*.test.js`), and not from a package's own entry points. A
decision made in the code is said there, in a remark on the line or in
the comment lines right above it: `// console: <why>`, `// catch: <what
is expected>`, `// log: <where, or why none>`, `// time: <why>`.

## Also exported

- `jsFiles(dir)`: the `.js` files of a folder, its `node_modules` aside.
- `checkText(text)`: the last five checks on one file's text:
  `[{ check, detail }]`, each detail with its line.
