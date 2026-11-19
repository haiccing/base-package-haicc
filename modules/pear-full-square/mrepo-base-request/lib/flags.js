// A request's flags: what is asked of the way a request is handled, beside
// what it asks for. Written after a command's URI, after the word --flags,
// space separated: the flags of that step. The list is closed by -- or by
// the end of the command:
//   crud/read swarms/* --flags log=debug
//   haicc host --flags log=debug -- crud/read swarms/*
// A flag stands alone (its value true) or carries a value, key=value, no
// space. In a request's form they are a map: { log: 'debug' }.
// Which flags there are is an enumeration, FLAGS: a flag's name, and the
// values it takes (a list of them; a pattern its value is written to;
// null: it stands alone). One that is not among them, or
// a value its flag does not take, is ignored, with a warning in the
// request's log: sorted() says which.
export const WORD = '--flags'
export const END = '--'
export const FLAGS = {
  // how much the request's log holds: info without the flag
  log: ['info', 'verbose', 'debug'],
  // the layer a command's own URI is read at: main without the flag
  // (a layer's name, its parts joined by /: request, request/done)
  layer: /^[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/,
  // a script to answer with, as a continuation (an action that has
  // scripts: boot/deploy, a script of the package deployed): its name
  continuation: /^[a-z0-9]+(-[a-z0-9]+)*$/,
  // a routing directive: boot/deploy's child deployed into a container,
  // on the container's own haicc install (the pair deploy); no value
  container: null
}
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

// A map of flags as written -> { flags: those there are, with a value
// they take; ignored: [{ flag, value, why }] the others }.
export function sorted (written = {}) {
  const flags = {}
  const ignored = []
  for (const [flag, value] of Object.entries(written ?? {})) {
    if (!(flag in FLAGS)) ignored.push({ flag, value, why: `no flag: ${flag} (${Object.keys(FLAGS).sort().join(', ')})` })
    else if (FLAGS[flag] === null ? value !== true : !takes(FLAGS[flag], value)) ignored.push({ flag, value, why: FLAGS[flag] === null ? `${flag} takes no value` : `${flag}=${value === true ? '' : value}: not ${Array.isArray(FLAGS[flag]) ? `one of ${FLAGS[flag].join(', ')}` : 'a value it takes'}` })
    else flags[flag] = value
  }
  return { flags, ignored }
}

// A command's parts with its flag list taken out. The list follows the
// command's URI (its first word, when no URI is written): the flags are
// that step's. It is closed by -- or by the end of the command, nothing
// else: every word in between is a flag (one there is none of is ignored,
// with a warning: sorted).
//   a command of its own       its arguments go on after the --; a list
//                              after its arguments is taken the same way
//   a command that passes on   (command: true; haicc's goto) the list
//   the words after its URI    stands right after the URI; the next
//                              command starts after the --, its words
//                              left as written: a list among them is its
//                              own
// -> { parts, flags, listed: whether a list was written }
export function split (parts, { command = false } = {}) {
  const i = command ? ([1, 2].find(k => parts[k] === WORD) ?? -1) : parts.indexOf(WORD, 1)
  if (i < 0) return { parts, flags: {}, listed: false }
  const end = parts.indexOf(END, i)
  const to = end < 0 ? parts.length : end
  return { parts: [...parts.slice(0, i), ...parts.slice(to + 1)], flags: flagsOf(parts.slice(i + 1, to)), listed: true }
}
