// A record:
// the base's minimum, { topic, timestamp, headers, value }; the headers left
// empty for now (their use to be planned). The onion: a record's value may be
// a record, wrapped. The core is the pre-filled form in a pre-addressed
// envelope: its topic where the completed form is to arrive (the sender
// itself; none: nobody waits for it), its value the request. Each hand-over
// replaces the wrapper (its topic the new place); the core is never rewrapped
// or changed on the way; processing completes the form: its value the
// request with its output (or the error that stopped it).
//
// The key: a GUID set by the sender on the core when the request is made,
// carried by every envelope around it, and the name of its document in every
// layer: a request traced everywhere by it.
import crypto from 'bare-crypto'

export const guid = () => {
  const b = crypto.randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export const record = (topic, value, key = null) => ({ topic, key, timestamp: new Date().toISOString(), headers: {}, value })
// An envelope around a record: its key the record's.
export const wrap = (topic, inner) => record(topic, inner, inner?.key ?? null)
// Completed: its output (or the error that stopped it), and its log when
// there is one (the entries kept: a request is its own record).
// (a continuation: with an output, what the one who asked goes on with:
// { at, script }; continuationOf says what one is)
export const complete = (core, result, log = []) => ({ ...core, value: { ...core.value, ...(result.ok ? { output: result.value } : { error: result.error }), ...(result.ok && result.continuation ? { continuation: result.continuation } : {}), ...(log.length ? { log } : {}) } })
// A continuation: a script to continue with, answered beside an output:
// { at, script }: the position it is run for, from the root as the one
// who answers sees it (`.` itself), and the script, its lines, each a
// simple command; at most CEILING bytes. Sent on by who asked, the
// terminal, as haicc/script at the position; not by an mrepo.
export const CEILING = 65536
export function continuationOf (script, at = '.') {
  if (typeof script !== 'string' || !script.trim()) throw new Error('not a continuation: its script, shell text')
  if (Buffer.byteLength(script) > CEILING) throw new Error(`not a continuation: ${Buffer.byteLength(script)} bytes (at most ${CEILING})`)
  if (typeof at !== 'string' || !at) throw new Error('not a continuation: the position it is run for')
  return { at, script }
}
// Log levels. An error and a warning are always kept (ALWAYS). Of the
// other three (DETAIL) a request says how much it wants: info, the least
// and what it gets unasked (its metrics and its audit), verbose (its
// steps), debug (its internals). There is no level that keeps nothing.
//   logger(level) -> { log(level, event, data), entries, level(to) }
//     level(to)   the detail kept from here on set to `to`; -> the one in
//                 use (a flag set later in a chain)
export const ALWAYS = ['error', 'warn']
export const DETAIL = ['info', 'verbose', 'debug']
export const LEVELS = [...ALWAYS, ...DETAIL]
export function logger (detail = 'info', now = () => new Date().toISOString()) {
  let max = Math.max(0, DETAIL.indexOf(detail))
  const entries = []
  const log = (level, event, data = {}) => {
    if (!LEVELS.includes(level)) throw new Error(`not a log level: ${level} (${LEVELS.join(', ')})`)
    if (ALWAYS.includes(level) || DETAIL.indexOf(level) <= max) entries.push({ level, event, time: now(), ...data })
  }
  const level = to => { if (DETAIL.includes(to)) max = DETAIL.indexOf(to); return DETAIL[max] }
  return { log, entries, level }
}
export const isComplete = core => Boolean(core?.value) && ('output' in core.value || 'error' in core.value)
