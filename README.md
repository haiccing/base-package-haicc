# base-package-haicc

HAICC: declare what a project needs, check it, make it so (haicc-reconcile), and its lifecycle (haicc-deployment). The entry package.

A package: self-contained, its code ready to run, laid out as it is installed. Written by the package manager (`pear-full-square/pkgm-base-manager`) from the development repository; do not edit here.

- requires: `haiccing/base-package-mycelium`
- hash: `2f56981ba7309abe39fb267f745d50cec10a535f00bb36a80974d247e6f3c2de`

## A work folder

Everything starts here. The setup, a release of this package (`haicc-setup.sh`, self-extracting: `sh` and `tar` only), extracts a work folder's `haiccing/`; its `boot` does the rest:

```sh
sh haicc-setup.sh ~/haicc-work                 # haiccing/: boot, sources (github haiccing), base-package-haicc
~/haicc-work/haiccing/boot                     # step 0, the repositories fetched, the package manager and HAICC into .haicc, ./haicc
cd ~/haicc-work && ./haicc run base-demo-liveness
```

```
<work>/
  haicc        the launcher: ./haicc <command>
  haiccing/    boot, sources, [install], the repositories
  .haicc/      the install: node/, packages/, log/ (boot's output, every command, every fetch)
  manager/     the deployments, one folder per project
```

Step 0 checks the host (Linux x86-64; Node.js 22 or later; git 2.25 or later; Docker Engine, rootful, native, running, and the user in the `docker` group: all needed, since nodes run in Docker containers) and fixes what is missing only with your yes (`haiccing/boot --yes` to agree beforehand): Node.js into `.haicc/node` (no sudo), git and Docker Engine with `apt`. `haiccing/sources` says where the repositories come from (`folder <path>`, `github <org>`), and `haiccing/install`, if there, is carried on with: one `haicc` command a line (`selftest.install` in `haicc-base-boot` is one).

## Holds

- `pear-full-square/haicc-reconcile`
- `pear-full-square/haicc-deployment`
- `pear-full-square/haicc-base-boot`

## Installed

By the package manager, into the host's install folder (`~/.haicc/packages`), with the packages it requires; its tests run there:

```sh
node <install folder>/pear-full-square/pkgm-base-manager/cli.js install haicc --from <folder of haiccing repositories>
node <install folder>/pear-full-square/pkgm-base-manager/cli.js test haicc
```
