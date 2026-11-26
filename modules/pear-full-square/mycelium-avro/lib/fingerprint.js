// A schema's identity: the CRC-64-AVRO fingerprint (Rabin) of its Parsing
// Canonical Form, as the AVRO specification defines both: the same schema,
// the same fingerprint, anywhere; a schema never changes, a new version is a
// new fingerprint. Written as 16 lowercase hex digits (the number, most
// significant first), a valid name; in a single-object header, its 8 bytes
// little-endian, as the specification says.
const EMPTY = 0xc15d213aa4d7a795n
const MASK = 0xffffffffffffffffn
const TABLE = (() => {
  const t = []
  for (let i = 0n; i < 256n; i++) {
    let fp = i
    for (let j = 0; j < 8; j++) fp = (fp >> 1n) ^ (EMPTY & (-(fp & 1n) & MASK))
    t.push(fp)
  }
  return t
})()

// bytes (a Uint8Array) -> the fingerprint, a BigInt
export function rabin (bytes) {
  let fp = EMPTY
  for (const b of bytes) fp = (fp >> 8n) ^ TABLE[Number((fp ^ BigInt(b)) & 0xffn)]
  return fp
}

// The Parsing Canonical Form's text -> the fingerprint, 16 hex digits.
export const fingerprintOf = canonical => rabin(Buffer.from(canonical, 'utf8')).toString(16).padStart(16, '0')

// 16 hex digits <-> the 8 bytes of a single-object header (little-endian).
export function bytesOf (fingerprint) {
  const b = Buffer.alloc(8)
  b.writeBigUInt64LE(BigInt('0x' + fingerprint))
  return b
}
export const hexOf = bytes => Buffer.from(bytes.buffer, bytes.byteOffset, 8).readBigUInt64LE().toString(16).padStart(16, '0')

export const isFingerprint = s => typeof s === 'string' && /^[0-9a-f]{16}$/.test(s)
