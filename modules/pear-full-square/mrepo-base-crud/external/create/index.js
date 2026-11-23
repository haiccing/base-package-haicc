// create: crud/create <URI> <value>, a node made sure to exist (README.md beside it).
import { isName } from 'mycelium-uri'
import { place, nodeAt, inside, folderOf, NODE } from '../../internal/node/index.js'

export async function create (exec, { uri, args = [] }) {
  const p = place(uri)
  if (!p.names) throw new Error('crud create: one node, not a selection (a * or a filter)')
  if (!p.names.length) throw new Error('missing argument: target')
  for (const n of p.names) if (!isName(n)) throw new Error(`not a name for a node: ${n} (in ${[p.layer, ...p.names].join('/')}: lowercase words joined by hyphens, no extension)`)
  let value = {}
  if (args[0] !== undefined) { try { value = JSON.parse(args[0]) } catch (err) { throw new Error(`not a document: ${args[0]} (JSON)`, { cause: err }) } }
  await exec.step('path', { uri: [p.layer, ...p.names].join('/') }, () => inside(exec, p, p.names))
  // the whole path: each node above it too, with an empty document; one
  // there already is left as it is, whatever value is given
  const made = new Set()
  for (let i = 1; i <= p.names.length; i++) {
    const names = p.names.slice(0, i)
    const there = Boolean(await nodeAt(exec, p, names))
    exec.log('debug', 'node', { at: p.at(names), there })
    if (there) continue
    exec.put(`${folderOf(p, names)}/${NODE}`, Buffer.from(JSON.stringify(i === p.names.length ? value : {}) + '\n'))
    made.add(i)
  }
  exec.log('verbose', 'made', { created: made.size, there: p.names.length - made.size })
  // (committed in the execution, so what was made is read back as stored)
  if (made.size) await exec.commit?.('created')
  const out = []
  for (let i = 1; i <= p.names.length; i++) out.push({ ...await nodeAt(exec, p, p.names.slice(0, i)), outcome: made.has(i) ? 'created' : 'there' })
  return out
}
