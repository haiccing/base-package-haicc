// mycelium-value-avro: an encoding, as a handler: one value to bytes and
// back, as AVRO, in its single-object encoding: two marker bytes (C3 01),
// the 8 bytes of the writer's schema's fingerprint, the value. Beside
// mycelium-value-json: a container is given one or the other.
//   const reg = registry(folder)             the install's, or in memory
//   const h = avro(reg, schema)              { extension, encode, decode }
//   h.encode(value)                          bytes, written as `schema`
//   h.decode(bytes)                          the value, read as `schema`
//                                            (is-like: any writer's data that
//                                            reads as it), or as written
//                                            when the handler has none
//   decode(reg, bytes, { as })               the same, a call
//   plain(value)                             to show: bytes left as base64
//   unfold(reg, bytes)                       every level decoded: each bytes
//                                            value that is itself single-
//                                            object encoded, decoded in place
//   is(reg, fingerprint, schema)             { is, why }: AVRO's own, by name
//   isLike(reg, fingerprint, schema)         { like, aliases, why }: the reader's
//                                            question, at read time
// An unknown fingerprint is an error, at the boundary where it is read.
import { typeOf, isLike as like, is as isAs, resolverOf, fingerprint, canonicalOf, wholeOf } from './lib/types.js'
import { bytesOf, hexOf, isFingerprint, fingerprintOf, rabin } from './lib/fingerprint.js'
import { registry, OWN, schemasOf } from './lib/registry.js'
import { fullnameOf, uriOf, partsOf } from './lib/names.js'

export { registry, OWN, schemasOf, fullnameOf, uriOf, partsOf, typeOf, fingerprint, canonicalOf, wholeOf, isFingerprint, fingerprintOf, rabin }

export const extension = 'avro'
const MARK = Buffer.from([0xc3, 0x01])
const HEAD = MARK.length + 8

const buffer = u => Buffer.isBuffer(u) ? u : Buffer.from(u.buffer, u.byteOffset, u.byteLength)

// Whether bytes are single-object encoded: the marker and room for a
// fingerprint.
export const isSingle = bytes => bytes instanceof Uint8Array && bytes.length >= HEAD && bytes[0] === 0xc3 && bytes[1] === 0x01
// The fingerprint a single-object value names.
export function fingerprintIn (bytes) {
  if (!isSingle(bytes)) throw new Error('not AVRO single-object encoded (no C3 01 marker)')
  return hexOf(buffer(bytes).subarray(MARK.length, HEAD))
}

// A schema (JSON, or a type) as a type: one the registry knows by name
// (a URI or a fullname) taken from it.
function asType (reg, schema) {
  if (schema && typeof schema === 'object' && typeof schema.toBuffer === 'function') return schema
  if (typeof schema === 'string' && schema.includes('/')) {
    const t = reg.latest(schema)
    if (!t) throw new Error(`unknown schema: ${schema} (none of that name in the registry)`)
    return t
  }
  return reg.typeOf(schema)
}

// value -> bytes: the single-object encoding, written as the type.
export function encode (reg, schema, value) {
  const t = asType(reg, schema)
  const fp = fingerprint(t)
  // (written as given: its fingerprint's entry the first schema of it)
  // the registry knows every schema it writes with
  if (!reg.get(fp)) reg.add(wholeOf(t))
  return Buffer.concat([MARK, bytesOf(fp), buffer(t.toBuffer(value))])
}

// bytes -> the value: the writer's schema from its fingerprint; read as
// `as` when given (is-like), else as written.
export function decode (reg, bytes, { as = null } = {}) {
  const writer = reg.type(fingerprintIn(bytes))
  const body = buffer(bytes).subarray(HEAD)
  if (!as) return writer.fromBuffer(body)
  const reader = asType(reg, as)
  if (fingerprint(reader) === fingerprint(writer)) return reader.fromBuffer(body)
  const r = resolverOf(writer, reader)
  return r.reader.fromBuffer(body, r.resolver)
}

// bytes -> the value, every level decoded: a bytes value inside that is
// single-object encoded is decoded in its place, all the way down (the
// cascade: the record, the request and its response, the action's own).
export function unfold (reg, bytes) {
  const deep = v => {
    if (v instanceof Uint8Array) return isSingle(v) ? unfold(reg, v) : v
    if (Array.isArray(v)) return v.map(deep)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)]))
    return v
  }
  return deep(decode(reg, bytes))
}

// A value made plain JSON, to show: bytes left in it (not single-object
// encoded) as their base64 text.
export function plain (v) {
  if (v instanceof Uint8Array) return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64')
  if (Array.isArray(v)) return v.map(plain)
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]))
  return v
}

// The reader's question: does the data a fingerprint names read as this
// schema? -> { like: true } or { like: false, why }.
export function isLike (reg, fp, schema) {
  return like(reg.type(fp), asType(reg, schema))
}
// AVRO's own question: is it that type (its name, or a declared alias)?
// -> { is: true } or { is: false, why }.
export function is (reg, fp, schema) {
  return isAs(reg.type(fp), asType(reg, schema))
}

// The handler: { extension, encode, decode }, for a container.
export function avro (reg, schema = null) {
  return {
    extension,
    encode: value => {
      if (!schema) throw new Error('an AVRO handler with no schema reads only')
      return encode(reg, schema, value)
    },
    decode: bytes => decode(reg, bytes, { as: schema })
  }
}
