// A command: a request as it is typed, its parts in order,
//   <protocol>/<action> <URI> <argument>...
// given as an array of parts or as a string (split at its spaces).
//
// A URI in a request is relative: no leading slash, relative to where its
// writer stands. `.` is the position itself; none given means `.`; `./x`
// is `x`. Outside it is one segment, as it is written.
// Inside, in the form the mrepo works with, a URI is an array of segments
// (mycelium-uri): the prefix where its writer stands, then the URI as it
// was written:
//   OUTSIDE   a request from outside stands at the mrepo's main: the prefix
//             main, two segments: ['main', 'host'], ['main', '.']; the
//             outside is restricted to main
//   OWN       the mrepo itself (a hook, a request of its own) stands at its
//             root, the folder above the layers: no prefix, one segment,
//             the layer first in it: ['runtime/hooks'], ['.']
//
// Flags (lib/flags.js) are written after a command's URI, after the word
// --flags: the flags of that step. In the form they are a map, `flags`,
// there only when one was written or came with the request. After the URI
// of a command that passes its words on (its action's config: `command:
// true`, haicc's goto) the list is that step's, and the next command
// starts after the -- that closes it; the words of that command are left
// as written: a list among them is its own.
import { relative, ROOT } from 'mycelium-uri'
import { split, layerOf, sorted, chained, rewrites, WORD, END } from './flags.js'

export { ROOT }
export const MAIN = 'main'
export const OUTSIDE = [MAIN]
export const OWN = []

//   interpret(command, protocols, at) -> { protocol, action, uri, args, flags? }
//     the first part    <protocol>/<action>; the protocol alone: its default
//                       action (its config's `default`, in protocols)
//     the second        the URI, as written where the writer stands (at,
//                       a prefix: OWN by default); none: `.`; in the form
//                       the prefix's segments, then it
//     the rest          the arguments, a list, unnamed
// Throws when it is no command, or the action cannot be told.
export function interpret (command, protocols = {}, at = OWN) {
  const given = typeof command === 'string' ? command.trim().split(/\s+/).filter(Boolean) : command
  if (!Array.isArray(given) || !given.length || given.some(p => typeof p !== 'string' || !p)) throw new Error('not a command: its parts, <protocol>/<action> <URI> <arguments>')
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

// The flags a request carries: those that came with it that hold down a
// chain (a command sent on brings the sender's: such a flag holds until
// changed), under those written with its own command.
const carried = (value, own) => {
  const flags = { ...chained(value.flags), ...(own ?? {}) }
  return Object.keys(flags).length ? { flags } : {}
}

// A request's value, as it is given, made the form the mrepo works with:
// a command (a string, an array of parts, or { command }) interpreted, its
// protocol, action, URI and arguments beside it; a form given filled in
// ({ protocol, action, uri, args }): its URI, one segment as written, taken
// where the writer stands, the same. Once: a form is made where a request
// comes in.
export function formOf (value, protocols = {}, at = OWN) {
  if (typeof value === 'string' || Array.isArray(value)) value = { command: value }
  if (!value || typeof value !== 'object') return value
  if (value.command !== undefined && value.protocol === undefined) { const form = interpret(value.command, protocols, at); return layered(rewritten({ ...value, ...form, ...carried(value, form.flags) }, protocols), protocols) }
  if (value.protocol === undefined) return value
  if (Array.isArray(value.uri)) throw new Error('not a URI: one segment, as it is written')
  return layered({ ...value, uri: [...at, relative(value.uri)] }, protocols)
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
// which checks the rewritten one; the flag gone from it; `rewritten` says
// which. The command stays in the form as typed. rewrite(form, value): the
// flag's value given with the form (a tail flag's: its text).
function rewritten (form, protocols) {
  const found = rewrites(form.flags)
  if (!found.length || problems(form, protocols).length) return form
  const [flag, f] = found[0]
  const { [flag]: gone, ...rest } = form.flags
  const { flags, ...plain } = form
  return { ...plain, ...f.rewrite(form, form.flags[flag]), ...(Object.keys(rest).length ? { flags: rest } : {}), rewritten: flag }
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
