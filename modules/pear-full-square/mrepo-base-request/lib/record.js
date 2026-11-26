// A record: the transport envelope, as the runtime package's type has it
// (haiccing/base-package-runtime, types/record.avsc): { topic, key, offset,
// timestamp (as JSON holds a time: ISO 8601), headers }, and what it carries, its value: one level, a
// request in the request streams (lib/request.js: self-contained, who
// asked and where its answer goes its own). Each hand-over is a new record
// (its topic the new place) around the same request.
//
// The offset: the milliseconds since the epoch when the request arrived at
// the mrepo (its inbox; its own requests, the same clock), given by the
// drop method (lib/boxes.js), never two the same. It is the request's one
// identity there: on every record around it, and the name of its document
// in every layer (13 digits): a request traced everywhere by it, and a
// layer's natural order. An offset is one mrepo's: a request that comes in
// from another (a child's answer) gets its own here, on its record, the
// other's kept as the record's key.
// (guid: an identity that is no request's: a link's)
import crypto from 'bare-crypto'

export const guid = () => {
  const b = crypto.randomBytes(16)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = b.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
export const record = (topic, value, offset = null, key = null) => ({ topic, key, offset, timestamp: new Date().toISOString(), headers: {}, value })
// A record given its offset, as it arrives.
export const stamp = (rec, offset) => ({ ...rec, offset })
// An mrepo's clock where it has no inbox folder to give its offsets (a
// store on git alone, a test): in one process, now or the last plus one.
let last = 0
export const tick = (now = Date.now()) => (last = Math.max(now, last + 1))
// A continuation: a script to continue with, on a request returned done
// (its processing's):
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
// and what it gets unasked, verbose (its steps), debug (its internals).
// There is no level that keeps nothing. An entry is the request type's:
// { time, level, event, line }: when (as JSON holds a time: ISO 8601; in
// AVRO milliseconds), its level, its kind
// (a stable name), and what happened, said: a line.
//   logger(level) -> { log(level, event, line), entries, level(to) }
//     level(to)   the detail kept from here on set to `to`; -> the one in
//                 use (a flag set later in a chain)
export const ALWAYS = ['error', 'warn']
export const DETAIL = ['info', 'verbose', 'debug']
export const LEVELS = [...ALWAYS, ...DETAIL]
export function logger (detail = 'info', now = () => new Date().toISOString()) {
  let max = Math.max(0, DETAIL.indexOf(detail))
  const entries = []
  const log = (level, event, line) => {
    if (!LEVELS.includes(level)) throw new Error(`not a log level: ${level} (${LEVELS.join(', ')})`)
    if (typeof line !== 'string' || !line.trim()) throw new Error(`not a log entry: ${event} (what happened, said: a line)`)
    if (ALWAYS.includes(level) || DETAIL.indexOf(level) <= max) entries.push({ time: now(), level, event, line })
  }
  const level = to => { if (DETAIL.includes(to)) max = DETAIL.indexOf(to); return DETAIL[max] }
  return { log, entries, level }
}
