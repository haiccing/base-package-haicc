// Values under a schema, whatever their encoding: a value checked against
// a type, and a value written as one type read as another. A JSON value is
// one: our JSON keeps AVRO's shapes (base-docs-avro, "Data shapes").
import { resolverOf } from './types.js'

// Is the value one of the type? Strict: a field its type does not name is
// not allowed, as one of the wrong type is not. -> { valid: true } or
// { valid: false, problems: [{ at, expected }] }: where it is not (the
// path in the value, / between its parts, '' the value itself) and the
// type expected there (a record's name, where a field of it is not its).
export function valid (type, value) {
  const problems = []
  type.isValid(value, { noUndeclaredFields: true, errorHook: (path, any, expected) => problems.push({ at: path.join('/'), expected: expected.name ?? expected.typeName ?? String(expected) }) })
  return problems.length ? { valid: false, problems } : { valid: true }
}

// A value written as `writer`, read as `reader`: AVRO's resolution (the
// writer's extra skipped, the reader's missing from their defaults, numbers
// widened), through AVRO's binary and back, so its rules are AVRO's own.
// like: is-like (aliases generated where the core types differ); false:
// is, names as declared. -> the value as the reader has it; throws, saying
// why, when it is not valid as the writer or does not read as the reader.
export function readAs (writer, reader, value, { like = true } = {}) {
  const check = valid(writer, value)
  if (!check.valid) throw new Error(`not a ${writer.name ?? writer.typeName}: ${check.problems.map(p => `${p.at || '.'} (${p.expected})`).join(', ')}`)
  const r = resolverOf(writer, reader, { like })
  return r.reader.fromBuffer(writer.toBuffer(value), r.resolver)
}
