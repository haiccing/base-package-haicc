// Records in a layer of the repository (a git branch): one JSON document a
// record, <name>.json, its name its offset (13 digits). Read from the
// repository as it stands; each write one commit, by the store's single
// writer (the runtime).
// A streaming layer (one whose config says so; the inbox, the outbox and
// request/done where none says: what only grows) keeps its records in buckets, as a streaming folder does
// (mycelium-container-document): /<layer>/17953/179531/<name>.json, the
// levels its config's (`structure`: its type `offset-files`, its `levels`,
// [5, 6] by default); a record is named by
// its offset alone. The others (pending, execute: a handful of records) are
// flat, the same names.
import * as json from 'mycelium-value-json'
import { placeOf, isOffset, BUCKETS } from 'mycelium-container-document'

export const STREAMS = ['inbox', 'outbox', 'request/done']
// A streaming layer's config, as the runtime writes it where it makes the
// layer itself: its structure declared; null for a layer that is none.
export const declarationOf = branch => (STREAMS.includes(branch)
  ? { mode: 'non-atomic', description: `The mrepo's ${branch}: its records, each under its offset.`, structure: { type: 'offset-files', levels: BUCKETS, batch: 50 } }
  : null)

export const AUTHOR = { name: 'mrepo', email: 'mrepo@localhost' }
// A layer's config (its mode, what it is for), committed with it when it is
// built from its structure: not one of its records.
export const CONFIG = '.layer'

// The names a layer's commits added, in the order of its commit chain (first
// parent, from its first commit to its head); within one commit, by name.
// Remembered per backend and layer: when the head moves, only the new commits
// are walked (back to the head walked last); the whole chain once, after a
// start.
const remembered = new WeakMap()
async function arrivals (backend, branch) {
  const head = Object.fromEntries(await backend.listBranches())[branch]
  if (!head) return []
  const memo = remembered.get(backend) ?? remembered.set(backend, new Map()).get(backend)
  const known = memo.get(branch)
  if (known?.head === head) return known.order
  const fresh = []
  let base = null
  for (let c = head; c;) {
    if (known && c === known.head) { base = known; break }
    const commit = await backend.readCommit(c)
    fresh.push(commit)
    c = commit.parents[0]
  }
  const namesOf = async tree => new Set((await backend.readTree(tree)).filter(e => e.type === 'blob' && e.name.endsWith('.json') && !e.name.startsWith('.')).map(e => e.name.slice(0, -'.json'.length)))
  const order = base ? [...base.order] : []
  let before = base ? base.names : new Set()
  for (const commit of fresh.reverse()) {
    const now = await namesOf(commit.tree)
    order.push(...[...now].filter(n => !before.has(n)).sort())
    before = now
  }
  memo.set(branch, { head, order, names: before })
  return order
}

// A layer's levels where it is a streaming one, null where it is not: its
// config's (`structure`: `offset-files`, its `levels`), read once a
// repository. Declared, always: a layer whose config says no structure is
// a folder, whatever its name. (The boxes and request/done, STREAMS, are
// declared by their package's config; made by the runtime where there is
// none, they are given theirs as they are made: declarationOf.)
const structures = new WeakMap()
function levelsOf (repo, branch) {
  const memo = structures.get(repo) ?? structures.set(repo, new Map()).get(repo)
  const unsaid = null
  // catch: no config, or none that reads: as one that says nothing
  if (!memo.has(branch)) memo.set(branch, repo.read(`/${branch}/${CONFIG}.json`).then(b => { const st = JSON.parse(b.toString()).structure; return st === undefined ? unsaid : st?.type === 'offset-files' ? st.levels ?? BUCKETS : null }, () => unsaid))
  return memo.get(branch)
}

export function layer ({ repo, writer, backend }, branch) {
  // a record's document: in the layer (what a change writes), in the repository (what is read)
  const within = async name => { const levels = await levelsOf(repo, branch); return `/${levels ? placeOf(name, levels) : name}.json` }
  const pathOf = async name => `/${branch}${await within(name)}`
  const named = found => found.filter(([p, n]) => n.type === 'blob' && p.endsWith('.json'))
    .map(([p]) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length)).filter(n => !n.startsWith('.'))
  const self = {
    branch,
    // (whether it streams: its records in folders by their offsets)
    streaming: async () => (await levelsOf(repo, branch)) !== null,
    pathOf,
    within,
    // The names it holds, in the order they arrived: a streaming layer's
    // natural order, its offsets ascending; another's, its commit chain.
    async arrived () {
      if (await self.streaming()) return self.list()
      const here = new Set(await self.list())
      return [...new Set((await arrivals(backend, branch)).filter(n => here.has(n)))]
    },
    // (after: a streaming layer's names greater than this one: past a pointer)
    async list ({ after = null } = {}) {
      const levels = await levelsOf(repo, branch)
      if (!levels) return named(await repo.select(`/${branch}/*`)).sort()
      const depth = levels.length
      // catch: a bucket that is none (no tree there): nothing in it
      const names = named(await repo.select(`/${branch}${'/*'.repeat(depth + 1)}`).catch(() => [])).filter(isOffset).sort()
      return after === null ? names : names.filter(n => n > after)
    },
    has: async name => (await repo.find(await pathOf(name))) !== null,
    read: async name => json.decode(await repo.read(await pathOf(name))),
    // (also: other documents of the layer written in the same commit, by
    // their path in it: { '.pointer': value })
    async put (name, value, message = `${name}`, also = {}) {
      const c = await writer.change(branch)
      await c.put(await within(name), json.encode(value))
      for (const [n, v] of Object.entries(also)) await c.put(`/${n}.json`, json.encode(v))
      return c.commit(message, { author: AUTHOR })
    },
    async remove (name, message = `${name} out`) {
      const c = await writer.change(branch)
      c.remove(await within(name))
      return c.commit(message, { author: AUTHOR })
    }
  }
  return self
}
