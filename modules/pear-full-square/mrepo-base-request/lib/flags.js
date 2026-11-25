// A request's flags: what is asked of the way a request is handled, beside
// what it asks for. Written after a command's URI, after the word --flags,
// space separated: the flags of that step. The list is closed by -- or by
// the end of the command:
//   crud/read swarms/* --flags log=debug
//   haicc host --flags log=debug -- crud/read swarms/*
// A flag stands alone (its value true) or carries a value, key=value, no
// space. In a request's form they are a map: { log: 'debug' }.
// Which flags there are: the folders of flags/, each its declaration
// (its kind, its scope, the values it takes: a list, a pattern, or null,
// it stands alone). This file names none of them. One that is not among
// them, or a value its flag does not take: said (sorted), and the command
// not run (lib/command.js, problems).
import { FLAGS } from '../flags/index.js'

export { FLAGS }
export const WORD = '--flags'
export const END = '--'
// The layer a request stands at when no flag says another.
export const LAYER = 'main'

// The words of a flag list -> the map as written.
export function flagsOf (words) {
  const flags = {}
  for (const word of words) {
    const i = word.indexOf('=')
    if (i > 0) flags[word.slice(0, i)] = word.slice(i + 1)
    else flags[word] = true
  }
  return flags
}

const takes = (spec, value) => (Array.isArray(spec) ? spec.includes(value) : typeof value === 'string' && spec.test(value))

// The layer a command's own URI is read at, by the flags in force: the
// flag's when it is written with a value it takes, else main.
export const layerOf = flags => sorted(flags).flags.layer ?? LAYER

// How a command's URI is read: logical (a topic as its records, its
// storage hidden) unless its physical flag is written (as its layer is
// stored): the one way to switch, a command at a time.
export const MODES = ['physical', 'logical']
export const modeOf = flags => (sorted(flags).flags.physical ? 'physical' : 'logical')

// A map of flags as written -> { flags: those there are, with a value
// they take; ignored: [{ flag, value, why }] the others }.
export function sorted (written = {}) {
  const flags = {}
  const ignored = []
  for (const [flag, value] of Object.entries(written ?? {})) {
    const spec = Object.hasOwn(FLAGS, flag) ? FLAGS[flag].values : undefined
    if (spec === undefined) ignored.push({ flag, value, why: `no flag: ${flag} (${Object.keys(FLAGS).sort().join(', ')})` })
    else if (spec === null ? value !== true : !takes(spec, value)) ignored.push({ flag, value, why: spec === null ? `${flag} takes no value` : FLAGS[flag].tail ? `${flag}: its text follows it (${WORD} ${flag} <text>)` : `${flag}=${value === true ? '' : value}: not ${Array.isArray(spec) ? `one of ${spec.join(', ')}` : 'a value it takes'}` })
    else flags[flag] = value
  }
  return { flags, ignored }
}

// The flags that hold down a chain: those a command sent on takes with it.
export function chained (flags = {}) {
  return Object.fromEntries(Object.entries(flags ?? {}).filter(([flag]) => !Object.hasOwn(FLAGS, flag) || FLAGS[flag].scope === 'chain'))
}

// The rewrite flags of a map, by name, with their declarations.
export const rewrites = (flags = {}) => Object.keys(flags ?? {}).filter(flag => Object.hasOwn(FLAGS, flag) && FLAGS[flag].kind === 'rewrite').map(flag => [flag, FLAGS[flag]])

// A command's parts with its flag list taken out. The list follows the
// command's URI (its first word, when no URI is written): the flags are
// that step's. It is closed by -- or by the end of the command, nothing
// else: every word in between is a flag (one there is none of: said,
// sorted).
//   a command of its own       its arguments go on after the --; a list
//                              after its arguments is taken the same way
//   a command that passes on   (command: true; haicc's goto) the list
//   the words after its URI    stands right after the URI; the next
//                              command starts after the --, its words
//                              left as written: a list among them is its
//                              own
// -> { parts, flags, listed: whether a list was written }
//   a tail flag (feedback)     every word after it is its value, joined
//                              by spaces, to the end of the command (a --
//                              among them too); after the URI of a command
//                              that passes on, to the -- that closes the
//                              list: written there, it is not the last
export function split (parts, { command = false } = {}) {
  const i = command ? ([1, 2].find(k => parts[k] === WORD) ?? -1) : parts.indexOf(WORD, 1)
  if (i < 0) return { parts, flags: {}, listed: false }
  const end = parts.indexOf(END, i)
  const to = end < 0 ? parts.length : end
  const k = parts.slice(i + 1, to).findIndex(isTail)
  if (k < 0) return { parts: [...parts.slice(0, i), ...parts.slice(to + 1)], flags: flagsOf(parts.slice(i + 1, to)), listed: true }
  // the tail: its text, from the word after it (or its own value, written key=value)
  const at = i + 1 + k
  const last = command ? to : parts.length
  const [flag, ...own] = parts[at].split('=')
  const text = [...(own.length ? [own.join('=')] : []), ...parts.slice(at + 1, last)].join(' ').trim()
  return { parts: [...parts.slice(0, i), ...(command ? parts.slice(to + 1) : [])], flags: { ...flagsOf(parts.slice(i + 1, at)), [flag]: text || true }, listed: true }
}

// A word that is a tail flag: every word after it its value.
const isTail = word => { const flag = word.split('=')[0]; return Object.hasOwn(FLAGS, flag) && FLAGS[flag].tail === true }
