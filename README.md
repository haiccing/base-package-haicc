# base-package-haicc

HAICC: declare what a project needs, check it, make it so (haicc-reconcile), its lifecycle (haicc-deployment), and its boot (haicc-base-boot). The entry: everything starts here.

## Start here

Linux on x86-64 (on Windows: inside WSL2), with `curl` and `tar`. The setup is this package's release, `haicc-setup.sh`; one command, stopping at the first step that fails:

```sh
curl -fL --progress-bar --retry 5 --retry-all-errors --connect-timeout 20 \
     -o haicc-setup.sh https://github.com/haiccing/base-package-haicc/releases/latest/download/haicc-setup.sh \
  && sh haicc-setup.sh ~/haicc-work \
  && ~/haicc-work/boot \
  && cd ~/haicc-work && ./haicc list
```

The boot runs in two stages. Stage 1, `./boot`, in plain shell: Linux x86-64 and Node.js (Node.js fixed with your yes, into `nodejs/`); HAICC's package copied whole into `packages/base-package-haicc/`; `./haicc` written. Stage 2, `./haicc boot`: the host's other prerequisites (git 2.25 or later; Docker Engine installed, running, rootful, native, and you in the `docker` group), each fixed only with your yes (`--yes` agrees beforehand); then `haiccing/install` if there (one `./haicc` command a line), or the next commands.

Everything it does is logged in the work folder's `log/` (`~/haicc-work/log/`): files named by their start, newest last. Everything is in plain sight: `boot`, `shutdown`, `haicc`, `haiccing/`, `packages/`, `nodejs/`, `log/`; no hidden folders. `./shutdown` takes it all back to the setup (keeping `haiccing/`, `log/`, `nodejs/`); `./boot` again sets it up.

The rest of HAICC (`haicc-reconcile`, `haicc-deployment`) runs in the nodes: `./haicc boot <swarm>` makes a swarm (in `swarms.json`), `<swarm>/haicc boot <node>` a node in it (in `<swarm>/nodes.json`; the first is the master), with its own HAICC and package manager. `haicc boot` and `haicc shutdown` work on the config of the folder they are called from.

## The package

- holds: `pear-full-square/haicc-reconcile`, `pear-full-square/haicc-deployment`, `pear-full-square/haicc-base-boot`
- requires: [haiccing/base-package-pkgm](https://github.com/haiccing/base-package-pkgm)
- hash: `25a1bd107a92c3a6c5d38cba1fc6631df24e71d7ef105ffc1bf375b1cf48d2fb`

In a work folder (see [haiccing/base-package-haicc](https://github.com/haiccing/base-package-haicc)), installed by HAICC as a project needs it, or by `./haicc install haicc` in a node's manager, into its `packages/` with what it requires; tested there, within the package: `./haicc test haicc`.

Written by the package manager from the development repository ([splectrum/dev-env-2-p2p-cluster](https://github.com/splectrum/dev-env-2-p2p-cluster)): not edited here.
