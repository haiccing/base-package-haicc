# test/info/

The generic info test: the package's pages, reached by its menus, against the README rules.

The info is extracted from the package's own files, as a runtime would
extract it, the package its own top: every README reached by a menu,
each checked: its one-liner, its summary, its sections, its menu.

Its code is in the module the package carries, at
`modules/pear-full-square/mrepo-base-info/validate/info.test.js`;
`run.js` here runs it. A generic test: the same folder in every package.
