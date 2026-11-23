// haicc/mrepos on a registry written for it: mrepos built under a work
// folder's mrepos/, their lists and their links, read only.
import test from 'brittle'
import fs, { mkdtempSync, mkdirSync, rmSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { p2pgitBackend, writer } from 'mycelium-git'
import { mrepos } from '../index.js'

// An mrepo at <work>/mrepos/<folder>: its identity, the package it is
// made of, its links; each layer a branch, as a build makes them.
async function mrepo (work, folder, pkg, links = []) {
  const gitdir = join(work, 'mrepos', ...folder.split('/'), '.git')
  mkdirSync(gitdir, { recursive: true })
  const backend = p2pgitBackend(gitdir, { fs })
  await backend.init()
  const w = writer(backend)
  const at = { author: { name: 'test', email: 'test@localhost' }, time: Date.now() }
  const layers = {
    runtime: { '/mrepo.json': { uri: folder === 'boot' ? 'local/boot' : folder } },
    packages: { '/layer.json': { packages: [pkg] } },
    links: Object.fromEntries(links.map((l, i) => [`/k${i}.json`, { key: `k${i}`, uri: l.uri, at: l.at, how: 'deployed' }]))
  }
  for (const [l, files] of Object.entries(layers)) {
    await w.createLayer(l, `Create ${l}`, at)
    const c = await w.change(l)
    for (const [p, v] of Object.entries(files)) await c.put(p, Buffer.from(JSON.stringify(v)))
    await c.commit(`Built ${l}`, at)
  }
}
const exec = (work, uri) => ({ runtime: { work, uri }, log () {}, step: async (event, data, fn) => fn() })

test('haicc/mrepos: the registry\'s mrepos, each its unique URI, its position from the mrepo asked through the links, its package, running or not; selected by an xpath', async (t) => {
  const work = mkdtempSync(join(tmpdir(), 'mrepos-'))
  try {
    await mrepo(work, 'boot', 'haiccing/base-component-boot', [{ uri: 'local/workbench', at: 'workbench' }])
    await mrepo(work, 'local/workbench', 'haiccing/base-solution-workbench', [{ uri: 'local/docs', at: 'docs' }, { uri: 'swarm-1/node-1', at: 'swarms/swarm-1/node-1' }])
    await mrepo(work, 'local/docs', 'haiccing/base-component-docs')
    await mrepo(work, 'swarm-1/node-1', 'haiccing/base-component-node')
    await mrepo(work, 'local/stray', 'haiccing/base-package-runtime')
    const all = await mrepos(exec(work, 'local/boot'), { uri: ['main', '.'] })
    t.alike(all.map(m => [m.uri, m.position, m.package, m.running]), [
      ['local/boot', '.', 'haiccing/base-component-boot', false],
      ['local/docs', 'workbench/docs', 'haiccing/base-component-docs', false],
      ['local/stray', null, 'haiccing/base-package-runtime', false],
      ['local/workbench', 'workbench', 'haiccing/base-solution-workbench', false],
      ['swarm-1/node-1', 'workbench/swarms/swarm-1/node-1', 'haiccing/base-component-node', false]
    ], 'every mrepo in the registry by its unique URI (the boot mrepo\'s its identity\'s, its folder mrepos/boot); its position through the links, forward only, the mrepo asked itself .; one linked nowhere: none; none running')
    const asker = exec(work, 'local/boot')
    t.alike((await mrepos(asker, { uri: ['main', 'local/docs'] })).map(m => [m.uri, m.position]), [['local/docs', 'workbench/docs']], 'one by its unique URI: where it is, from here')
    t.alike((await mrepos(asker, { uri: ['main', 'local/*'] })).map(m => m.uri), ['local/boot', 'local/docs', 'local/stray', 'local/workbench'], 'a namespace\'s')
    t.alike((await mrepos(asker, { uri: ['main', "*/*[package='haiccing/base-component-docs']"] })).map(m => m.uri), ['local/docs'], 'filtered on its record')
    t.alike((await mrepos(exec(work, 'local/workbench'), { uri: ['main', 'local/docs'] }))[0].position, 'docs', 'from another mrepo: its own links')
    t.alike((await mrepos(exec(work, 'local/docs'), { uri: ['main', 'local/workbench'] }))[0].position, null, 'not forward of the mrepo asked: none')
    t.alike(await mrepos(asker, { uri: ['main', 'local/none'] }), [], 'nothing selected: an empty list')
    await t.exception(mrepos({ runtime: {}, log () {}, step: async (e, d, fn) => fn() }, { uri: ['.'] }), /no work folder/, 'no work folder: said')
  } finally { rmSync(work, { recursive: true, force: true }) }
})
