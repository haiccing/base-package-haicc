# base-package-haicc

HAICC: declare what a project needs, check it, make it so (haicc-reconcile), its lifecycle (haicc-deployment), and its boot (haicc-base-boot). The entry: everything starts here.

## Start here

Linux on x86-64 (on Windows: inside WSL2), with `curl` and `tar`. The setup is this package's release, `haicc-setup.sh`:

```sh
curl -fsSL -o haicc-setup.sh https://github.com/haiccing/base-package-haicc/releases/latest/download/haicc-setup.sh
sh haicc-setup.sh ~/haicc-work         # a work folder: haiccing/ with boot, sources and this package
~/haicc-work/haiccing/boot             # the root: Node.js, HAICC's root part, then git and Docker checked
cd ~/haicc-work
./haicc list
```

The boot runs in two stages. Stage 1, `haiccing/boot`, in plain shell: Linux x86-64 and Node.js (Node.js fixed with your yes, into `.haicc/node`); the root's part of HAICC (`haicc-base-boot`) copied into `.haicc/`; `./haicc` written. Stage 2, `./haicc boot`: the host's other prerequisites (git 2.25 or later; Docker Engine installed, running, rootful, native, and you in the `docker` group), each fixed only with your yes (`--yes` agrees beforehand); then `haiccing/install` if there (one `./haicc` command a line), or the next commands. Everything it prints goes to `.haicc/log/haicc.log` too.

The rest of HAICC (`haicc-reconcile`, `haicc-deployment`) runs in managers: each swarm self-contained, with its own HAICC, package manager and packages (`./haicc boot <manager>`, next).

## The package

- holds: `pear-full-square/haicc-reconcile`, `pear-full-square/haicc-deployment`, `pear-full-square/haicc-base-boot`
- requires: [haiccing/base-package-pkgm](https://github.com/haiccing/base-package-pkgm)
- hash: `58fb397be615ebeebe5b0a4c57bc559e624c6f260aa509f242ba2737666ec37d`

In a work folder (see [haiccing/base-package-haicc](https://github.com/haiccing/base-package-haicc)), installed by HAICC as a project needs it, or by `./haicc install haicc`, into `.haicc/packages` with what it requires; tested there, within the package: `./haicc test haicc`.

Written by the package manager from the development repository ([splectrum/dev-env-2-p2p-cluster](https://github.com/splectrum/dev-env-2-p2p-cluster)): not edited here.
