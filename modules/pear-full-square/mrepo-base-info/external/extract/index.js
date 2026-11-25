// extract: info/extract, the mrepo's info layer from its linked packages'
// bundles: what is there replaced (README.md beside it).
import { readFileSync, existsSync, readdirSync, statSync } from 'bare-fs'
import { join } from 'bare-path'
import Bundle from 'bare-bundle'
import { joined } from 'mycelium-uri'
import { extract, built, LAYER, WANTED } from '../../internal/info/index.js'

const CONFIG = { mode: 'atomic', description: 'Info: the pages of the packages the mrepo links, each once, addressed by keywords from the top down, and their index (extracted as the mrepo is made ready).' }
// A document that may not be there: null then; one that is there and is
// no document is an error.
// log: none (one read; the action says what it found)
const json = async (exec, uri) => {
  const bytes = await exec.find(uri)
  if (bytes === null) return null
  try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${uri}`, { cause: err }) }
}

// The packages a store holds: <org>/<package>.bundle, sorted.
// (each folder an organisation: its bundles; addons and the like hold none)
const storedIn = store => (existsSync(store) ? readdirSync(store).filter(o => /^[a-z][a-z0-9-]*$/.test(o) && statSync(join(store, o)).isDirectory()).flatMap(o => readdirSync(join(store, o)).filter(f => f.endsWith('.bundle')).map(f => `${o}/${f.slice(0, -'.bundle'.length)}`)).sort() : [])

export async function extractAction (exec, { uri }) {
  const at = joined(uri)
  if (at !== '.' && at !== 'main') throw new Error(`info extract: the whole mrepo only, . (not ${at})`)
  const listed = (await json(exec, '/packages/manifest.json'))?.packages
  if (!listed) { exec.log('verbose', 'no packages', {}); return { keywords: 0, pages: 0, changed: false, problems: 0 } }
  const dir = exec.runtime.dir
  // in deploy order, the mrepo's own last: the manifest's order
  const present = Object.keys(listed).filter(pkg => existsSync(join(dir, 'packages', `${pkg}.bundle`)))
  // what its list documents beyond itself (documents: store): every
  // package in the store, the install's, reached through its packages
  // manifest's mapping, read only; nothing of them placed here
  const documents = (await json(exec, '/packages/.layer.json'))?.documents ?? null
  const store = documents === 'store' ? (await json(exec, '/packages/manifest.json'))?.store ?? null : null
  if (documents === 'store' && !store) throw new Error('documents: store: the packages manifest names no store')
  const stored = store ? storedIn(store).filter(pkg => !listed[pkg]) : []
  const bundleOf = pkg => (listed[pkg] ? join(dir, 'packages', `${pkg}.bundle`) : join(store, `${pkg}.bundle`))
  const read = await exec.step('bundles', r => ({ listed: Object.keys(listed).length, present: present.length, documented: stored.length, files: r.reduce((n, p) => n + Object.keys(p.files).length, 0) }), async () => [...present, ...stored].map(pkg => {
    const b = Bundle.from(readFileSync(bundleOf(pkg)))
    const files = {}
    for (const k of Object.keys(b.files)) if (WANTED(k)) files[k] = b.read(k)
    exec.log('debug', 'bundle', { package: pkg, files: Object.keys(files).length })
    return { pkg, files, paths: Object.keys(b.files), documented: !listed[pkg] }
  }))
  const files = await exec.step('extract', r => ({ files: Object.keys(r).length }), async () => extract(read))
  if (await exec.find(`/${LAYER}/.layer.json`) === null) files['/.layer.json'] = Buffer.from(JSON.stringify(CONFIG, null, 2) + '\n')
  // what was written before: the pages its indexes named, each
  // package's index
  const before = await built(exec)
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
