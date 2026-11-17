# modules/

The package's code: our modules and the third-party code they use.

Assembled from the modules `package.json` names, all the way down; never
edited by hand. Each of ours carries its own tests, run by the package's
modules test, `/test/modules`. The third-party code: `node_modules/`, 63
modules for linux-x64, each with its version, licence and source in
`third-party.json`. Our modules find each other by name through
`node_modules/`, links.

## Links

- [mrepo-base-haicc](pear-full-square/mrepo-base-haicc/)
- [mrepo-base-info](pear-full-square/mrepo-base-info/)
- [mrepo-base-xpath](pear-full-square/mrepo-base-xpath/)
- [mycelium-uri](pear-full-square/mycelium-uri/)
- [mycelium-xpath](pear-full-square/mycelium-xpath/)
- [pkgm-base-check](pear-full-square/pkgm-base-check/)
