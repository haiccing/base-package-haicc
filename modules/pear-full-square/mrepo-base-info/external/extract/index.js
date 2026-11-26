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
  if (!listed) { exec.log('verbose', 'no packages', 'No packages manifest in this mrepo.'); return 'No packages linked here: nothing to extract.' }
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
  const read = await exec.step('bundles', r => `Read ${present.length} of ${Object.keys(listed).length} listed bundles${stored.length ? ` and ${stored.length} documented from the store` : ''}: ${r.reduce((n, p) => n + Object.keys(p.files).length, 0)} files wanted.`, async () => [...present, ...stored].map(pkg => {
    const b = Bundle.from(readFileSync(bundleOf(pkg)))
    const files = {}
    for (const k of Object.keys(b.files)) if (WANTED(k)) files[k] = b.read(k)
    exec.log('debug', 'bundle', `${pkg}: ${Object.keys(files).length} files.`)
    return { pkg, files, paths: Object.keys(b.files), documented: !listed[pkg] }
  }))
  const files = await exec.step('extract', r => `Its info made: ${Object.keys(r).length} files.`, async () => extract(read))
  if (await exec.find(`/${LAYER}/.layer.json`) === null) files['/.layer.json'] = Buffer.from(JSON.stringify(CONFIG, null, 2) + '\n')
  // what was written before: the pages its indexes named, each
  // package's index
  const before = await built(exec)
  let changed = false
  const written = { put: 0, removed: 0 }
  await exec.step('write', () => `Written into the info layer: ${written.put} put, ${written.removed} removed.`, async () => {
    for (const [p, bytes] of Object.entries(files)) {
      const was = await exec.find(`/${LAYER}${p}`)
      if (!was || !Buffer.from(was).equals(bytes)) { exec.log('debug', 'put', `Put ${p}.`); exec.put(`/${LAYER}${p}`, bytes); changed = true; written.put++ }
    }
    for (const p of before) {
      if (!files[p] && await exec.find(`/${LAYER}${p}`) !== null) { exec.log('debug', 'removed', `Removed ${p}.`); exec.remove(`/${LAYER}${p}`); changed = true; written.removed++ }
    }
  })
  const index = JSON.parse(files['/index.json'].toString())
  const keywords = Object.keys(index).length
  const pages = Object.keys(files).filter(p => p.endsWith('README.md')).length
  const problems = JSON.parse(files['/problems.json'].toString()).length
  if (problems) exec.log('warn', 'problems', `${problems} ${problems === 1 ? 'problem' : 'problems'} in its pages: info/problems.json.`)
  // (which files: what the request changed, in the info layer)
  return [
    `Extracted the info of ${present.length} ${present.length === 1 ? 'package' : 'packages'}${stored.length ? `, ${stored.length} more documented from the store` : ''}: ${keywords} keywords, ${pages} pages.`,
    changed ? `The info layer changed: ${written.put} put, ${written.removed} removed.` : 'Nothing changed: the info layer as it was.',
    problems ? `${problems} ${problems === 1 ? 'problem' : 'problems'} in its pages: info/problems.json.` : 'No problems in its pages.'
  ].join('\n')
}
