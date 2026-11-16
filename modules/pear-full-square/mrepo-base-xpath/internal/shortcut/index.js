// shortcut: a node whose data originates elsewhere, another mrepo linked at
// its position: where its sources are recorded, and where it leads
// (README.md beside it).
import { join } from 'bare-path'
import { ROOT } from 'mycelium-uri'

// The layer positions are in: where the outside stands.
export const MAIN = 'main'

// An mrepo's identity, in its runtime layer: { uri }, its unique URI,
// <swarm>/<node> (local/<name> for what the boot mrepo creates).
export const IDENTITY = '/runtime/mrepo.json'

// A position's shortcuts, in main beside the node's document, hidden (a
// name starting with a dot is no URI's): host -> main/host/.shortcuts.json.
// A list: each entry a source the node's data comes from, { mrepo }, its
// unique URI: only the link, nothing local to a machine.
export const SHORTCUTS = '.shortcuts.json'
export const shortcutOf = position => `main/${position === ROOT ? '' : `${position}/`}${SHORTCUTS}`
// The sources recorded at a position: its list, [] when it has none.
// log: none (a read of one small file; its callers say what they found)
export const shortcutsAt = async (exec, position) => {
  const bytes = await exec.find(shortcutOf(position))
  if (bytes === null) return []
  let list
  try { list = JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a list of shortcuts: ${shortcutOf(position)}`, { cause: err }) }
  return Array.isArray(list) ? list : []
}

// A node is a folder holding its document under this name: hidden (no URI
// has a name starting with a dot), and what keeps the folder in git.
export const NODE = '.node.json'

// The registry: a layer of the mrepo that deploys, an entry a mrepo it
// deployed, a node by that mrepo's unique URI (registry/local/host): what
// this machine knows of it: where it is (folder: relative to this mrepo's
// own folder), the position that links to it (at), the package it came
// from, what runs it. main holds the link only.
export const REGISTRY = 'registry'
export const entryOf = uri => `${REGISTRY}/${uri}/${NODE}`
// The entry of an mrepo, by its unique URI: null when it has none here.
// log: none (one read; its callers say what they found)
export async function registered (exec, uri) {
  const bytes = await exec.find(entryOf(uri))
  if (bytes === null) return null
  try { return JSON.parse(bytes.toString()) } catch (err) { throw new Error(`not a document: ${entryOf(uri)}`, { cause: err }) }
}

// The swarm of a unique URI: its first part; local when it has none.
export const swarmOf = uri => (typeof uri === 'string' && uri.includes('/') ? uri.split('/')[0] : 'local')

// The unique URI of an mrepo linked at a name, by the mrepo that links it:
// in the same swarm.
export const uriOf = (parent, name) => `${swarmOf(parent)}/${name}`

// A shortcut as a command is sent on to it: its entry (the first source:
// one in use for now) and where it leads on this machine, read from the
// registry: the linked mrepo's folder, relative to this mrepo's and
// absolute (when the context names this mrepo's folder); none when the
// registry has no entry for it: not reachable from here.
// log: none (one read; its callers say what they found)
export async function linkOf (exec, position, entry) {
  const dir = exec.runtime?.dir ?? exec.dir ?? null
  const folder = (await registered(exec, entry.mrepo))?.folder ?? null
  return { at: position, ...entry, folder, dir: dir && folder ? join(dir, folder) : null }
}
