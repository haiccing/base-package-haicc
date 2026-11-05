# base-package-haicc

HAICC: declare what a project needs, check it, make it so (haicc-reconcile), and its lifecycle (haicc-deployment). The entry package.

A package: self-contained, its code ready to run, laid out as it is installed. Written by the package manager (`pear-full-square/pkgm-base-manager`) from the development repository; do not edit here.

- requires: `haiccing/base-package-mycelium`
- hash: `eb12eac8d80ba38867840d4719226b67f493e663698b719b96dae5ece1fd9574`

## Kicking HAICC

From a folder of `haiccing` repositories side by side (clones, or plain copies), at least this one, `base-package-pkgm` and what HAICC requires (`base-package-mycelium`, `base-package-third-party`):

```sh
sh base-package-haicc/kick.sh            # step 0 (the host's prerequisites), the package manager, HAICC
sh base-package-haicc/pear-full-square/haicc-base-boot/step0.sh check   # only look
```

Step 0 checks the host (Linux x86-64; Node.js 22 or later; git 2.25 or later; Docker Engine, rootful, native, running, and the user in the `docker` group: all needed, since nodes run in Docker containers) and fixes what is missing only with your yes (`--yes` to agree beforehand): Node.js into `~/.haicc/node` (no sudo), git and Docker Engine with `apt`. Then `haicc` is in `~/.haicc/bin`. A project (a demo) needs no kick: its `run.sh` kicks HAICC if needed.

## From scratch

On a machine with only `curl` and `tar` (Linux x86-64): the repositories fetched as archives and unpacked side by side, then the kick.

```sh
mkdir -p ~/haiccing && cd ~/haiccing
for r in base-package-haicc base-package-pkgm base-package-mycelium base-package-third-party; do
  curl -fsSL https://github.com/haiccing/$r/archive/refs/heads/main.tar.gz | tar -xz && mv $r-main $r
done
sh base-package-haicc/kick.sh
```

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
