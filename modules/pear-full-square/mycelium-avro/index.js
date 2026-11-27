// mycelium-avro: the schemas, in AVRO's schema language, whatever the
// encoding: a schema as a type, its name, its fingerprint, a value checked
// against it, one type read as another. No storage, no registry, no
// encoding of its own: those are built on it.
//   typeOf(schema, named)        a schema (JSON) -> its type; the named types
//                                it refers to found in `named`, those it
//                                defines added there
//   canonicalOf(type)            its Parsing Canonical Form (AVRO's)
//   contractOf(type)             its contract form: its schema whole without
//                                its descriptions
//   fingerprint(type)            its fingerprint, of its contract form, 16
//                                hex digits
//   wholeOf(type)                its schema whole, self-contained
//   primitiveOf(uri), isPrimitive(uri)
//                                AVRO's own types by URI, avro/<name>
//   fullnameOf(uri), uriOf(fullname), partsOf(fullname)
//                                a name: its URI and its AVRO fullname, exact
//                                both ways; its core type and its variant
//   valid(type, value)           { valid } or { valid: false, problems };
//                                strict: no field its type does not name
//   readAs(writer, reader, value, { like })
//                                a value of one type read as another
//   is(writer, reader)           { is } or { is: false, why }: AVRO's own
//   isLike(writer, reader)       { like, aliases } or { like: false, why }
//   resolverOf(writer, reader, { like })
//                                the reader to read with and its resolver
export { typeOf, canonicalOf, contractOf, fingerprint, wholeOf, primitiveOf, isPrimitive, PRIMITIVES, is, isLike, resolverOf, LOGICAL } from './lib/types.js'
export { fingerprintOf, rabin, bytesOf, hexOf, isFingerprint } from './lib/fingerprint.js'
export { fullnameOf, uriOf, partsOf } from './lib/names.js'
export { valid, readAs } from './lib/values.js'
