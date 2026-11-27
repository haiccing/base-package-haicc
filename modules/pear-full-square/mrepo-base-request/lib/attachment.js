// An answer's attachments, between a value and the wrapper it is kept and
// sent as (haiccing/base-package-runtime, types/attachment.avsc): the
// platform's own conversion, under the hood. An action hands over a value
// and is handed a value, never bytes.
//   wrapped(types, attachments)   as an answer is written: each value the
//                                 wrapper, its content AVRO's binary of the
//                                 value by the type its URI names, base64
//   opened(types, attachments)    as an answer is handed to action code:
//                                 each wrapper its value
// types: what the mrepo holds ({ type(uri) }: the runtime's, its avro
// layer); none: no value is written, none read.
// What an attachment is, is told by its keys, never by what it holds:
// content, a wrapper already built (passed on as it is); value, a value;
// else at, where its value is, a pointer.
import { avro } from 'mycelium-value'

const has = (a, key) => Object.prototype.hasOwnProperty.call(a, key) && Object.prototype.propertyIsEnumerable.call(a, key)
const NO_TYPES = 'no types held here'
// A type's URI: two parts or more, each a URI's name (avro/string,
// <org>/<package>/<name>).
const URI = /^[a-z0-9-]+(\/[a-z0-9-]+)+$/
// What a wrapper handed to action code came as, kept out of sight: passed
// on as it was handed, it is carried as it came, not encoded again.
const CAME = Symbol('came')

function named (a) {
  if (!a || typeof a !== 'object' || typeof a.name !== 'string' || !a.name.trim() || typeof a.type !== 'string') throw new Error('not an attachment: its name, its type by its URI, then its value or where its value is')
  if (!URI.test(a.type)) throw new Error(`not an attachment: ${a.name} (its type not a URI: ${a.type})`)
  return a
}

// A value that does not fit its type, or a type not held here: thrown,
// naming the attachment, the reason its cause (the place it does not fit).
// A wrapper is exactly one of its content and where its value is.
export function wrapped (types, attachments = []) {
  if (!Array.isArray(attachments)) throw new Error('not attachments: a list, each its name, its type by its URI, its value')
  return attachments.map(given => {
    const a = named(given)
    if (a[CAME]) return a[CAME]
    const at = typeof a.at === 'string' && a.at ? a.at : null
    if (a.content != null) {
      if (at) throw new Error(`not an attachment: ${a.name} (both its content and where its value is)`)
      return { name: a.name, type: a.type, content: a.content, at: null }
    }
    if (has(a, 'value')) {
      // catch: said with the attachment it is, the reason kept
      try {
        if (!types) throw new Error(NO_TYPES)
        return { name: a.name, type: a.type, content: avro(types.type(a.type)).encode(a.value).toString('base64'), at: null }
      } catch (err) { throw new Error(`not attached: ${a.name} (${a.type})`, { cause: err }) }
    }
    if (at) return { name: a.name, type: a.type, content: null, at }
    throw new Error(`not an attachment: ${a.name} (neither a value nor where its value is)`)
  })
}

// Each wrapper its value, frozen, the wrapper it came as kept with it (so
// passed on untouched it is carried as it came). A wrapper whose type is
// not held here: handed as it is, to be passed on untouched; its value
// refused when asked for, said. Content that is no value of its type:
// thrown, naming the attachment. A pointer: its name, its type, where its
// value is. A value already (an action's own answer, not stored yet): as
// it is.
export function opened (types, attachments = []) {
  if (!Array.isArray(attachments ?? [])) throw new Error('not attachments: a list of wrappers')
  return (attachments ?? []).map(a => {
    if (a.content == null) return has(a, 'value') ? a : { name: a.name, type: a.type, at: a.at ?? null }
    const came = { name: a.name, type: a.type, content: a.content, at: a.at ?? null }
    let type = null
    let why = NO_TYPES
    // catch: a type not held: the wrapper handed on, why said when its value is asked for
    try { if (types) type = types.type(a.type) } catch (err) { why = err.message }
    if (type) {
      let value
      // catch: said with the attachment it is, the reason kept
      try { value = avro(type).decode(Buffer.from(a.content, 'base64')) } catch (err) { throw new Error(`not read: ${a.name} (${a.type})`, { cause: err }) }
      return Object.freeze(Object.defineProperty({ name: a.name, type: a.type, value }, CAME, { value: came }))
    }
    const kept = { ...came }
    Object.defineProperty(kept, 'value', { enumerable: false, get () { throw new Error(`value not read: ${a.name} (${why})`) } })
    return kept
  })
}

// What was returned, as action code is handed it: its attachments opened.
export const handed = (types, returned) => (returned ? { ...returned, attachments: opened(types, returned.attachments) } : returned)
