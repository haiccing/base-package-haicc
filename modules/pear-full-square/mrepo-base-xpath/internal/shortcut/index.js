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

// A position's folder in the shadow structure of main, relative to the
// mrepo's own folder: host -> main/host. What is linked at the position
// sits there: an mrepo, its inbox and outbox folders inside.
export const shadowOf = position => join(MAIN, ...(position === ROOT ? [] : position.split('/')))

// The swarm of a unique URI: its first part; local when it has none.
export const swarmOf = uri => (typeof uri === 'string' && uri.includes('/') ? uri.split('/')[0] : 'local')

// The unique URI of an mrepo linked at a name, by the mrepo that links it:
// in the same swarm.
export const uriOf = (parent, name) => `${swarmOf(parent)}/${name}`

// A shortcut as a command is sent on to it: its entry (the first source:
// one in use for now) and where it leads: the linked mrepo's folder,
// relative to this mrepo's (the shadow of main) and absolute, when the
// context names this mrepo's folder.
// log: none (nothing read: a value made from its arguments)
export const linkOf = (exec, position, entry) => {
  const dir = exec.runtime?.dir ?? exec.dir ?? null
  return { at: position, ...entry, folder: shadowOf(position), dir: dir ? join(dir, shadowOf(position)) : null }
}
