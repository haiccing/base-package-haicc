// extract: help/extract, the mrepo's help layer from the READMEs of its
// linked packages: what is there replaced (README.md beside it). An internal
// request: the runtime places it as it starts, before the mrepo takes
// requests in.
import { readFileSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import Bundle from 'bare-bundle'
import { joined } from 'mycelium-uri'
import { extract } from '../../internal/extract/index.js'

const LAYER = { mode: 'atomic', description: 'Help: the READMEs of the packages the mrepo links, at the URIs they document, and their index (extracted as the mrepo starts).' }
// A document that may not be there: null then; one that is there and is
// no document is an error.
// log: none (one read; the action says what it found)
const json = async (exec, uri) => {
  const bytes = await exec.find(uri)
  if (bytes === null) return null
  try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${uri}`, { cause: err }) }
}
// A package's `help` setting, from its package.json in its bundle; a
// bundle without one has none.
const helpOf = (b, pkg) => {
  const bytes = b.read('/package.json')
  if (bytes === null) return null
  try { return JSON.parse(bytes.toString()).help ?? null } catch (err) { throw new Error(`not a document: ${pkg}'s package.json`, { cause: err }) }
}

export async function extractAction (exec, { uri }) {
  const at = joined(uri)
  if (at !== '.' && at !== 'main') throw new Error(`help extract: the whole mrepo only, . (not ${at})`)
  const listed = (await json(exec, '/packages/manifest.json'))?.packages
  if (!listed) { exec.log('verbose', 'no packages', {}); return { readmes: 0, changed: false, problems: 0 } }
  const dir = exec.runtime.dir
  const present = Object.keys(listed).filter(pkg => existsSync(join(dir, 'packages', `${pkg}.bundle`)))
  const read = await exec.step('bundles', r => ({ listed: Object.keys(listed).length, present: present.length, readmes: r.reduce((n, p) => n + Object.keys(p.files).length, 0) }), async () => present.map(pkg => {
    const b = Bundle.from(readFileSync(join(dir, 'packages', `${pkg}.bundle`)))
    const readmes = {}
    for (const k of Object.keys(b.files)) if (k.endsWith('/README.md')) readmes[k] = b.read(k)
    exec.log('debug', 'bundle', { package: pkg, readmes: Object.keys(readmes).length })
    return { pkg, files: readmes, help: helpOf(b, pkg), paths: Object.keys(b.files) }
  }))
  const files = await exec.step('extract', r => ({ files: Object.keys(r).length }), async () => extract(read))
  if (await exec.find('/help/layer.json') === null) files['/layer.json'] = Buffer.from(JSON.stringify(LAYER, null, 2) + '\n')
  const old = await json(exec, '/help/index.json')
  let changed = false
  const written = { put: 0, removed: 0 }
  await exec.step('write', () => written, async () => {
    for (const [p, bytes] of Object.entries(files)) {
      const was = await exec.find(`/help${p}`)
      if (!was || !Buffer.from(was).equals(bytes)) { exec.log('debug', 'put', { path: p }); exec.put(`/help${p}`, bytes); changed = true; written.put++ }
    }
    for (const u of Object.keys(old ?? {})) {
      const p = u === '/' ? '/README.md' : `${u}/README.md`
      if (!files[p]) { exec.log('debug', 'removed', { path: p }); exec.remove(`/help${p}`); changed = true; written.removed++ }
    }
  })
  const problems = JSON.parse(files['/problems.json'].toString()).length
  exec.log(problems ? 'warn' : 'info', 'extracted', { readmes: Object.keys(files).filter(p => p.endsWith('README.md')).length, changed, problems })
  return { readmes: Object.keys(files).filter(p => p.endsWith('README.md')).length, changed, problems }
}
