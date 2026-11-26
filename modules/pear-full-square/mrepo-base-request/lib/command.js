// A command: a request as it is typed, its words in order (lib/lines.js,
// the one parser, splits its line),
//   <protocol>/<action> <URI> <argument>...
//
// A URI in a request is relative: no leading slash, relative to where its
// writer stands. `.` is the position itself; none given means `.`; `./x`
// is `x`. As it is written it is one URI.
// Inside, in the form the mrepo works with, a URI is a chain of parts
// (mycelium-uri), kept apart so no boundary is parsed again: the layer
// first, then the local root positions gone through, then the URI as it
// was written, the last. One pattern for every request, whoever asks: it
// stands at the mrepo's main (STANDING) unless a position (a haicc
// command went there) or a flag (layer=<name>) says another:
// ['main', 'host'], ['main', '.'], ['main', 'swarms/swarm-1', '.'],
// ['runtime', 'hooks']. What led to this mrepo is not in it: forward
// visibility only. (Read as one URI, for a query: its parts joined.)
// The mrepo's own requests differ in what they are allowed, not in how
// their URI is written: any layer, by the flag, as anyone names one.
//
// Flags (lib/flags.js) are written after a command's URI, after the word
// --flags: the flags of that step. After the URI of a command that passes
// its words on (its action's config: `command: true`, haicc's goto) the
// list is that step's, and the next command starts after the -- that
// closes it; the words of that command are left as written: a list among
// them is its own.
import { relative, ROOT } from 'mycelium-uri'
import { split, layerOf, sorted, chained, rewrites, WORD, END } from './flags.js'

export { ROOT }
export const MAIN = 'main'
// Where a request stands when nothing says another: the layer main.
export const STANDING = [MAIN]

//   interpret(words, protocols, at) -> { protocol, action, uri, args, flags? }
//     the first word    <protocol>/<action>; the protocol alone: its default
//                       action (its config's `default`, in protocols)
//     the second        the URI, as written where the writer stands (at,
//                       the parts before it: STANDING by default); none:
//                       `.`; in the form those parts, then it
//     the rest          the arguments, a list, unnamed
// Throws when it is no command, or the action cannot be told.
export function interpret (given, protocols = {}, at = STANDING) {
  if (!Array.isArray(given) || !given.length || given.some(p => typeof p !== 'string' || !p)) throw new Error('not a command: its words, <protocol>/<action> <URI> <arguments>')
  const first = given[0]
  if (first === WORD) throw new Error(`not a command: flags follow a command's URI (<protocol>/<action> <URI> ${WORD} <flag>... [${END}] ...)`)
  const names = first.split('/')
  if (names.length > 2 || names.some(n => !n)) throw new Error(`not a command: ${first} (<protocol>/<action>)`)
  const [protocol, action = protocols?.[protocol]?.default] = names
  if (!action) throw new Error(`no action: ${first} (${protocol} has no default action)`)
  // its flags, after its URI; the words after those of a command that
  // passes on are the next command, left as written
  const passes = passesOn({ protocol, action }, protocols)
  const { parts: [, second, ...args], flags, listed } = split(given, { command: passes })
  // (a list not closed takes the command that was to follow for flags)
  if (passes && listed && !args.length) throw new Error(`not a command: no command after the flags of ${first} (${END} closes a flag list, the command follows it)`)
  return { protocol, action, uri: [...at, relative(second)], args, ...(Object.keys(flags).length ? { flags } : {}) }
}

// A command line's words (lib/lines.js, the one parser) read as the form
// the mrepo works with, where the writer stands: interpreted, a rewrite
// flag applied, its URI at the layer its flags say. What a request's form
// is made by (lib/request.js, understood); throws when it is no command.
export const read = (parts, protocols = {}, at = STANDING) => layered(rewritten(interpret(parts, protocols, at), protocols), protocols)

// A command's words with the flags in force written into them: what a
// command sent on, or run inside another, takes with it (those that hold
// down a chain; a fact once: in its line, nowhere beside it). Written at
// the head of its own flag list, so what it writes itself comes after and
// holds; where it has none, a list of its own after its URI, closed.
export function carrying (parts, flags = {}, protocols = {}) {
  const held = Object.entries(chained(sorted(flags).flags)).map(([flag, value]) => (value === true ? flag : `${flag}=${value}`))
  if (!held.length || !Array.isArray(parts) || !parts.length) return parts
  const [protocol, action = protocols?.[protocol]?.default] = parts[0].split('/')
  const passes = passesOn({ protocol, action }, protocols)
  const i = passes ? ([1, 2].find(k => parts[k] === WORD) ?? -1) : parts.indexOf(WORD, 1)
  if (i >= 0) return [...parts.slice(0, i + 1), ...held, ...parts.slice(i + 1)]
  const at = Math.min(2, parts.length)
  return [...parts.slice(0, at), WORD, ...held, END, ...parts.slice(at)]
}

// What keeps a command from being run, by its flags (strict: nothing of it
// is run; the request completes, not failed, saying so): a flag that is
// none, or a value its flag does not take; a rewrite on a command that
// passes its words on (it is not the last), a rewrite whose protocol is not
// here, more than one rewrite. -> the reasons; [] when none
export function problems (form, protocols = {}) {
  const why = sorted(form?.flags).ignored.map(i => i.why)
  const found = rewrites(form?.flags)
  if (found.length > 1) why.push(`one rewrite at a time: ${found.map(([flag]) => flag).join(', ')}`)
  for (const [flag, f] of found) {
    if (passesOn(form, protocols)) why.push(`${flag}: on the last command only (it rewrites the command it is on)`)
    else if (!protocols?.[f.protocol]) why.push(`${flag}: no protocol ${f.protocol} here`)
  }
  return why
}

// A rewrite flag applied (when nothing keeps the command from being run):
// the command it is on becomes the request its flag says, before the door,
// which checks the rewritten one; the flag gone from it. The command as
// typed is the request's own line. rewrite(form, value): the flag's value
// given with the form (a tail flag's: its text).
function rewritten (form, protocols) {
  const found = rewrites(form.flags)
  if (!found.length || problems(form, protocols).length) return form
  const [flag, f] = found[0]
  const { [flag]: gone, ...rest } = form.flags
  const { flags, ...plain } = form
  return { ...plain, ...f.rewrite(form, form.flags[flag]), ...(Object.keys(rest).length ? { flags: rest } : {}) }
}

// main is the default layer of a request that stands there: a flag changes
// it (layer=request). The command's own URI is then read at that layer.
// Not the URI of a command that passes its words on (haicc's goto): that
// one is a position, and positions are main's; the flag goes on with the
// command that follows.
export const passesOn = (form, protocols) => protocols?.[form.protocol]?.actions?.[form.action]?.command === true
export const layerFor = (form, protocols) => (passesOn(form, protocols) ? MAIN : layerOf(form.flags))
function layered (form, protocols) {
  const layer = layerFor(form, protocols)
  return form.uri[0] === MAIN && layer !== MAIN ? { ...form, uri: [layer, ...form.uri.slice(1)] } : form
}
