// mrepos: haicc/mrepos [<xpath>], the install's mrepos as its registry
// holds them, read only (README.md beside it).
import fs, { existsSync, readdirSync, statSync } from 'bare-fs'
import { join, relative } from 'bare-path'
import { openRepo, p2pgitBackend } from 'mycelium-git'
import { query } from 'mycelium-xpath'
import { ask } from 'mrepo-base-runtime'
import { segmented, joined } from 'mycelium-uri'
import { MREPOS } from 'mrepo-base-request'

// The registry: every mrepo's folder under mrepos/, by its unique URI, a
// path (no mrepo's folder inside another's: a folder with .git ends it).
// log: none (reads only; the action says what it found)
function registered (base, at = base) {
  if (!existsSync(at)) return []
  if (existsSync(join(at, '.git'))) return [relative(base, at)]
  return readdirSync(at).sort().filter(n => statSync(join(at, n)).isDirectory()).flatMap(n => registered(base, join(at, n)))
}

// An mrepo read from its folder: its unique URI (its identity; the boot
// mrepo's folder is mrepos/boot, its URI local/boot), the package that
// defines it (its list's last), its links (each child's unique URI and
// position in it).
// log: none (reads only; the action says what it found)
async function readOf (dir) {
  const repo = openRepo(p2pgitBackend(join(dir, '.git'), { fs }))
  // catch: a document not there: none
  const json = async p => { try { return JSON.parse((await repo.read(p)).toString()) } catch { return null } }
  const list = (await json('/packages/layer.json'))?.packages ?? []
  const links = []
  // catch: no links layer: no links
  const files = await repo.select('/links/*').catch(() => [])
  for (const [p] of files) {
    if (!p.endsWith('.json') || p.endsWith('/layer.json')) continue
    const r = await json(p)
    if (r?.uri && r?.at) links.push({ uri: r.uri, at: r.at })
  }
  return { uri: (await json('/runtime/mrepo.json'))?.uri ?? null, package: list.at(-1) ?? null, links }
}

export async function mrepos (exec, { uri = ['.'] }) {
  const work = exec.runtime.work
  if (!work) throw new Error('no work folder: the install\'s registry is not here')
  const base = join(work, MREPOS)
  const folders = await exec.step('registry', r => ({ mrepos: r.length }), async () => registered(base))
  // each by its unique URI: its identity's, else its folder's path
  const read = {}
  const folder = {}
  for (const f of folders) { const r = await readOf(join(base, ...f.split('/'))); const u = r.uri ?? f; read[u] = r; folder[u] = join(base, ...f.split('/')) }
  const uris = Object.keys(read).sort()
  // positions from the mrepo asking, through the links, forward only: each
  // child's position its parent's, then its own
  const position = {}
  const me = exec.runtime.uri
  const walk = (u, at) => { for (const l of read[u]?.links ?? []) if (!(l.uri in position)) { position[l.uri] = at ? `${at}/${l.at}` : l.at; walk(l.uri, position[l.uri]) } }
  if (me) { position[me] = '.'; walk(me, '') }
  // each as a record; running: its runtime answering over its socket
  const records = {}
  await exec.step('records', r => ({ records: Object.keys(r).length }), async () => {
    for (const u of uris) records[u] = { uri: u, position: position[u] ?? null, package: read[u].package, running: Boolean(await ask({ repo: folder[u], op: 'status', timeout: 2000 })) }
    return records
  })
  // the selection: the xpath, written where the URI is (main's prefix of a
  // request from outside not part of it), over the records, a node a
  // segment of their unique URIs, an mrepo's record its document; none,
  // or the position itself: every one
  const s = segmented(uri)
  const written = joined(s[0] === 'main' && s.length > 1 ? s.slice(1) : s)
  const text = written === '.' || written === 'main' ? null : written
  if (text === null) { exec.log('info', 'mrepos', { found: uris.length }); return uris.map(u => records[u]) }
  const tree = { children: {}, record: null }
  for (const u of uris) { let n = tree; for (const s of u.split('/')) n = n.children[s] ??= { children: {}, record: null }; n.record = records[u] }
  const { found } = await query({
    children: node => Object.entries(node.children),
    document: node => (node.record ? { position: node.record.position, package: node.record.package, running: node.record.running } : null)
  }, tree, text)
  const out = found.map(f => f.node?.record).filter(Boolean)
  exec.log('info', 'mrepos', { query: text, found: out.length })
  return out
}
