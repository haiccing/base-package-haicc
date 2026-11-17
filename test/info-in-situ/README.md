# test/info-in-situ/

The generic info test where the package is deployed: its pages in a running mrepo's info.

Run by `runtime run`, which names the mrepo and the package and hands
over the info its runtime extracted: the package's README reached from
the top, no problem in its pages.

Its code is in the module the package carries, at
`modules/pear-full-square/mrepo-base-info/validate/info-in-situ.test.js`;
`run.js` here runs it. A generic test: the same folder in every package.
