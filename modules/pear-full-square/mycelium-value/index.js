// mycelium-value: the simple value transformations: one value to bytes and
// back, by a handler (README.md beside it). A handler is what a storage
// container is given: { extension, encode(value) -> bytes, decode(bytes) ->
// value }.
//   json         one line of JSON
//   avro(type)   AVRO's binary of a value by the type given (mycelium-avro's):
//                plain, the value's bytes and nothing else: for within an
//                install, where a type's URI names one schema
import { valid } from 'mycelium-avro'

export const json = {
  extension: 'json',
  encode: value => Buffer.from(JSON.stringify(value) + '\n'),
  decode: bytes => JSON.parse(Buffer.from(bytes).toString('utf8'))
}

// A value as plain data (the library reads a record as an object of its own
// class): records and maps plain objects, arrays arrays, bytes kept.
const plain = v => (Array.isArray(v) ? v.map(plain) : v instanceof Uint8Array ? v : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v)

// avro(type) -> a handler for values of that type. encode: the value checked
// first, strictly, so one that does not fit is said with its place, not as
// the library fails; decode: the bytes read whole as that type.
export function avro (type) {
  return {
    extension: 'avro',
    encode (value) {
      const v = valid(type, value)
      if (!v.valid) throw new Error(`not a value of its type: ${v.problems.map(p => `${p.at || '.'}, expected ${p.expected}`).join('; ')}`)
      return Buffer.from(type.toBuffer(value))
    },
    decode (bytes) {
      // catch: bytes that are no value of the type: said as that
      try { return plain(type.fromBuffer(Buffer.from(bytes))) } catch (err) { throw new Error(`not the bytes of a value of its type: ${err.message}`, { cause: err }) }
    }
  }
}
