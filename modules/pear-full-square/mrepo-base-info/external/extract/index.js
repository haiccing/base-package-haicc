// extract: info/extract, the mrepo's info layer from its linked packages'
// bundles: what is there replaced (README.md beside it).
import { readFileSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import Bundle from 'bare-bundle'
import { joined } from 'mycelium-uri'
import { extract, LAYER } from '../../internal/info/index.js'

const CONFIG = { mode: 'atomic', description: 'Info: the pages of the packages the mrepo links, each once, addressed by keywords from the top down, and their index (extracted as the mrepo is made ready).' }
// What extraction reads of a bundle: its READMEs, its package.json, its
// list, its third-party code's record.
// (a schema a package carries: its own, its modules')
const SCHEMA = /^\/(modules\/[^/]+\/[^/]+\/)?schemas\/[^/]+\.json$/
const WANTED = k => k.endsWith('/README.md') || k === '/package.json' || k === '/mrepo/packages/layer.json' || k === '/modules/third-party.json' || SCHEMA.test(k)
// A document that may not be there: null then; one that is there and is
// no document is an error.
// log: none (one read; the action says what it found)
const json = async (exec, uri) => {
  const bytes = await exec.find(uri)
  if (bytes === null) return null
  try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${uri}`, { cause: err }) }
}

export async function extractAction (exec, { uri }) {
  const at = joined(uri)
  if (at !== '.' && at !== 'main') throw new Error(`info extract: the whole mrepo only, . (not ${at})`)
  const listed = (await json(exec, '/packages/manifest.json'))?.packages
  if (!listed) { exec.log('verbose', 'no packages', {}); return { keywords: 0, pages: 0, changed: false, problems: 0 } }
  const dir = exec.runtime.dir
  // in deploy order, the mrepo's own last: the manifest's order
  const present = Object.keys(listed).filter(pkg => existsSync(join(dir, 'packages', `${pkg}.bundle`)))
  const read = await exec.step('bundles', r => ({ listed: Object.keys(listed).length, present: present.length, files: r.reduce((n, p) => n + Object.keys(p.files).length, 0) }), async () => present.map(pkg => {
    const b = Bundle.from(readFileSync(join(dir, 'packages', `${pkg}.bundle`)))
    const files = {}
    for (const k of Object.keys(b.files)) if (WANTED(k)) files[k] = b.read(k)
    exec.log('debug', 'bundle', { package: pkg, files: Object.keys(files).length })
    return { pkg, files, paths: Object.keys(b.files), documented: Boolean(listed[pkg].documented) }
  }))
  const files = await exec.step('extract', r => ({ files: Object.keys(r).length }), async () => extract(read))
  if (await exec.find(`/${LAYER}/layer.json`) === null) files['/layer.json'] = Buffer.from(JSON.stringify(CONFIG, null, 2) + '\n')
  // what was written before: the pages its index named, the two documents
  const old = await json(exec, `/${LAYER}/index.json`)
  const before = new Set(Object.values(old ?? {}).flat().map(c => `/${c.page}`))
  let changed = false
  const written = { put: 0, removed: 0 }
  await exec.step('write', () => written, async () => {
    for (const [p, bytes] of Object.entries(files)) {
      const was = await exec.find(`/${LAYER}${p}`)
      if (!was || !Buffer.from(was).equals(bytes)) { exec.log('debug', 'put', { path: p }); exec.put(`/${LAYER}${p}`, bytes); changed = true; written.put++ }
    }
    for (const p of before) {
      if (!files[p] && await exec.find(`/${LAYER}${p}`) !== null) { exec.log('debug', 'removed', { path: p }); exec.remove(`/${LAYER}${p}`); changed = true; written.removed++ }
    }
  })
  const index = JSON.parse(files['/index.json'].toString())
  const out = { keywords: Object.keys(index).length, pages: Object.keys(files).filter(p => p.endsWith('README.md')).length, changed, problems: JSON.parse(files['/problems.json'].toString()).length }
  exec.log(out.problems ? 'warn' : 'info', 'extracted', out)
  return out
}
