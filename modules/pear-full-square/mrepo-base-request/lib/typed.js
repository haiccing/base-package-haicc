// typed: a request record as AVRO, the cascade (README.md beside it): the
// record (mycelium's), its value the form completed (Request, this
// module's), in that its arguments and its output (the action's own when
// given, else json). A record whose value is a record (an envelope) is the
// same, a level more. What a node's log holds, a record each; today's
// request layers, inbox and outbox stay JSON.
//   encodeRecord(reg, record, { args, output })  -> bytes
//   decodeRecord(reg, bytes)                     -> the record, as JSON holds it
//   logHandler(reg, { args, output })            { extension, encode, decode }
import { encode, decode, isSingle } from 'mycelium-value-avro'
import SCHEMA from '../schemas/request.json' with { type: 'json' }

export const RECORD = 'pear-full-square/mycelium-value-avro/record'
export const JSON_TYPE = 'pear-full-square/mycelium-value-avro/json'
export const REQUEST = 'pear-full-square/mrepo-base-request/request'
// The form's fields the schema has; the others kept in `more`.
const FIELDS = ['protocol', 'action', 'uri', 'args', 'flags', 'command', 'output', 'error', 'continuation', 'log']
const isRecord = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v) && 'timestamp' in v && 'value' in v

// A log entry: { level, event, time, ...data } <-> { level, event, time, data }.
const entryOf = ({ level, event, time = null, ...data }) => ({ level, event, time, data })
const entryFrom = ({ level, event, time, data }) => ({ level, event, ...(time === null ? {} : { time }), ...data })

// (the next level: as the schema given, when its value is valid as it; else json)
const next = (reg, as, v) => encode(reg, as && reg.latest(as)?.isValid(v) ? as : JSON_TYPE, v)

// (its own schema known to the registry it writes with)
const requestType = reg => reg.type(reg.add(SCHEMA).fingerprint)

function formBytes (reg, form, { args = null, output = null }) {
  const more = Object.fromEntries(Object.entries(form).filter(([k]) => !FIELDS.includes(k)))
  return encode(reg, requestType(reg), {
    protocol: form.protocol ?? null,
    action: form.action ?? null,
    uri: Array.isArray(form.uri) ? form.uri : form.uri === undefined || form.uri === null ? null : [String(form.uri)],
    args: 'args' in form ? next(reg, args, form.args) : null,
    flags: form.flags ?? null,
    command: form.command ?? null,
    // (output: there when the form has one, even null: a completed form)
    output: 'output' in form ? next(reg, output, form.output) : null,
    error: form.error ?? null,
    continuation: form.continuation ?? null,
    log: (form.log ?? []).map(entryOf),
    more
  })
}

export function encodeRecord (reg, rec, opts = {}) {
  const value = isRecord(rec.value) ? encodeRecord(reg, rec.value, opts) : rec.value && typeof rec.value === 'object' ? formBytes(reg, rec.value, opts) : rec.value === null || rec.value === undefined ? null : encode(reg, JSON_TYPE, rec.value)
  return encode(reg, RECORD, { topic: rec.topic ?? null, key: rec.key ?? null, timestamp: rec.timestamp, headers: rec.headers ?? {}, value })
}

function formFrom (reg, bytes) {
  const f = decode(reg, bytes)
  if (!('log' in f && 'more' in f)) return f
  const out = {}
  for (const k of ['protocol', 'action', 'uri']) if (f[k] !== null) out[k] = f[k]
  if (f.args !== null) out.args = decode(reg, f.args)
  if (f.flags !== null) out.flags = f.flags
  if (f.command !== null) out.command = f.command
  Object.assign(out, f.more)
  if (f.output !== null) out.output = decode(reg, f.output)
  if (f.error !== null) out.error = f.error
  if (f.continuation !== null) out.continuation = { at: f.continuation.at, script: f.continuation.script }
  if (f.log.length) out.log = f.log.map(entryFrom)
  return out
}

export function decodeRecord (reg, bytes) {
  const r = decode(reg, bytes, { as: RECORD })
  let value = r.value
  if (isSingle(value)) {
    const inner = decode(reg, value)
    value = isRecord(inner) && 'headers' in inner ? decodeRecord(reg, value) : formFrom(reg, value)
  }
  return { topic: r.topic, key: r.key, timestamp: r.timestamp, headers: r.headers, value }
}

// The value handler for a topic of records (a node's log): a record to
// bytes and back.
export const logHandler = (reg, opts = {}) => ({ extension: 'avro', encode: rec => encodeRecord(reg, rec, opts), decode: bytes => decodeRecord(reg, bytes) })
