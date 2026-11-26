// The engine on schemas written for it: nothing stored, nothing encoded
// to keep; a value is checked, or read as another type.
import test from 'brittle'
import * as avro from '../index.js'

const { typeOf, valid, readAs, is, isLike } = avro
const plain = v => JSON.parse(JSON.stringify(v))

const ANSWER = {
  type: 'record',
  name: 'haiccing.basePackageHelp.annotateAnswer',
  fields: [
    { name: 'help', type: 'string' },
    { name: 'does', type: ['null', 'string'], default: null },
    { name: 'answer', type: { type: 'array', items: 'string' } }
  ]
}

test('the fingerprint: CRC-64-AVRO of the Parsing Canonical Form', (t) => {
  // the AVRO specification's own test values (schema-tests.txt)
  t.is(BigInt('0x' + avro.fingerprintOf('"int"')).toString(), '8247732601305521295', '"int"')
  t.is(BigInt('0x' + avro.fingerprintOf('"null"')).toString(), '7195948357588979594', '"null"')
  const t1 = typeOf({ ...ANSWER, doc: 'kept out', fields: ANSWER.fields.map(f => ({ ...f, doc: 'out' })) })
  const t2 = typeOf(ANSWER)
  t.is(avro.fingerprint(t1), avro.fingerprint(t2), 'docs are not part of it')
  t.is(avro.canonicalOf(t2), '{"name":"haiccing.basePackageHelp.annotateAnswer","type":"record","fields":[{"name":"help","type":"string"},{"name":"does","type":["null","string"]},{"name":"answer","type":{"type":"array","items":"string"}}]}')
  t.ok(avro.isFingerprint(avro.fingerprint(t2)))
  t.not(avro.fingerprint(typeOf({ ...ANSWER, name: 'splectral.other.annotateAnswer' })), avro.fingerprint(t2), 'the full name is part of it: a variant, its own fingerprint')
  t.is(avro.hexOf(avro.bytesOf(avro.fingerprint(t2))), avro.fingerprint(t2), 'its 8 bytes and back')
  t.is(avro.wholeOf(t1).doc, 'kept out', 'the schema whole keeps what the canonical form leaves out')
})

test('a name is its URI, exact both ways; its core type and its variant', (t) => {
  t.is(avro.fullnameOf('haiccing/base-package-help/annotate-answer'), 'haiccing.basePackageHelp.annotateAnswer')
  t.is(avro.uriOf('haiccing.basePackageHelp.annotateAnswer'), 'haiccing/base-package-help/annotate-answer')
  t.is(avro.fullnameOf('haiccing/base-package-runtime/request/done/request'), 'haiccing.basePackageRuntime.request.done.request', 'a position\'s variant: any number of parts')
  t.is(avro.uriOf('haiccing.basePackageRuntime.request.done.request'), 'haiccing/base-package-runtime/request/done/request')
  t.is(avro.uriOf('org.apache.avro.Thing_1'), null, 'a name from elsewhere: no URI')
  t.is(avro.uriOf('Plain'), null)
  t.exception(() => avro.fullnameOf('haiccing/node-1/x'), /data name/, 'a segment that is no data name')
  t.alike(avro.partsOf('haiccing.basePackageRns.logEntry'), { type: 'logEntry', variant: 'haiccing.basePackageRns' }, 'the name the core type, the namespace its variant')
  t.alike(avro.partsOf('plain'), { type: 'plain', variant: null })
})

test('a value checked against a type: a JSON value is one; where it is not, said; strict, a field not named refused', (t) => {
  const type = typeOf(ANSWER)
  t.alike(valid(type, { help: 'h', does: null, answer: ['x'] }), { valid: true }, 'a JSON value in its shape')
  t.alike(valid(type, { help: 'h', answer: [] }), { valid: true }, 'a field left out that has a default')
  t.alike(valid(type, JSON.parse('{"help":"h","does":"it","answer":["a","b"]}')), { valid: true }, 'as parsed from JSON text')
  t.alike(valid(type, { help: 5, answer: ['x', 2] }), { valid: false, problems: [{ at: 'help', expected: 'string' }, { at: 'answer/1', expected: 'string' }] }, 'not one: each place, and what was expected there')
  t.alike(valid(type, { does: null, answer: [] }).problems.map(p => p.at), ['help'], 'a field missing, with no default')
  t.absent(valid(type, 'text').valid, 'not a record at all')
  t.alike(valid(type, { help: 'h', answer: [], more: 1 }), { valid: false, problems: [{ at: '', expected: 'haiccing.basePackageHelp.annotateAnswer' }] }, 'strict: a field the type does not name: not valid, the record said')
  t.alike(valid(typeOf({ type: 'record', name: 'a.Outer', fields: [{ name: 'inner', type: ANSWER }] }), { inner: { help: 'h', answer: [], extra: true } }).problems.map(p => p.at), ['inner'], 'strict all the way down: the place said')
  t.alike(valid(typeOf('long'), 7), { valid: true }, 'a plain type')
})

test('a JSON value written as one type, read as another: the writer\'s extra skipped, the reader\'s missing from its default, numbers widened', (t) => {
  const writer = typeOf(ANSWER)
  const reader = typeOf({ type: 'record', name: 'org.other.help', fields: [{ name: 'help', type: 'string' }, { name: 'lines', type: 'long', default: 3 }, { name: 'answer', type: { type: 'array', items: 'string' } }] })
  t.alike(plain(readAs(writer, reader, { help: 'h', does: null, answer: ['x'] })), { help: 'h', lines: 3, answer: ['x'] }, 'read as the reader needs, record names not required to match')
  t.ok(isLike(writer, reader).like)
  const not = isLike(writer, typeOf({ type: 'record', name: 'N', fields: [{ name: 'size', type: 'int' }] }))
  t.absent(not.like, 'a field it needs, with no default: not like it')
  t.ok(not.why)
  const w = typeOf({ type: 'record', name: 'a.B', fields: [{ name: 'n', type: 'int' }, { name: 'inner', type: { type: 'record', name: 'a.C', fields: [{ name: 'x', type: 'int' }] } }] })
  const wide = typeOf({ type: 'record', name: 'z.Y', fields: [{ name: 'n', type: 'double' }, { name: 'inner', type: { type: 'record', name: 'z.W', fields: [{ name: 'x', type: 'long' }] } }] })
  t.alike(plain(readAs(w, wide, { n: 5, inner: { x: 1 } })), { n: 5, inner: { x: 1 } }, 'numbers widened, a record inside by its field')
  t.exception(() => readAs(writer, reader, { help: 5, answer: [] }), /not a haiccing.basePackageHelp.annotateAnswer: help \(string\)/, 'a value that is not the writer\'s type: said, with where')
  t.exception(() => readAs(writer, typeOf({ type: 'record', name: 'N', fields: [{ name: 'size', type: 'int' }] }), { help: 'h', answer: [] }), 'a reader it does not read as: said')
})

test('is and is-like, one mechanism: a core type\'s variant read as AVRO is; a different core type read as another, the aliases applied said', (t) => {
  const entry = { type: 'record', name: 'haiccing.basePackageRns.logEntry', fields: [{ name: 'key', type: 'string' }, { name: 'timestamp', type: 'long' }, { name: 'uri', type: 'string' }, { name: 'output', type: ['null', 'string'], default: null }] }
  const line = { type: 'record', name: 'splectral.baseComponentLogViewer.line', fields: [{ name: 'timestamp', type: 'long' }, { name: 'uri', type: 'string' }, { name: 'output', type: ['null', 'string'], default: null }] }
  const variant = { ...line, name: 'splectral.baseComponentLogViewer.logEntry' }
  const writer = typeOf(entry)
  const value = { key: 'k', timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' }
  t.ok(is(writer, typeOf(variant)).is, 'is: one core type (logEntry), another variant (its namespace): read as AVRO reads it')
  t.alike(isLike(writer, typeOf(variant)).aliases, {}, 'no alias generated for a variant')
  t.alike(plain(readAs(writer, typeOf(variant), value, { like: false })), { timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' }, 'the variant reads it, key skipped')
  t.absent(is(writer, typeOf(line)).is, 'is: not the same core type')
  t.exception(() => readAs(writer, typeOf(line), value, { like: false }), 'read as is: refused')
  const like = isLike(writer, typeOf(line))
  t.ok(like.like, 'is-like: the same thing, with less detail')
  t.alike(like.aliases, { 'splectral.baseComponentLogViewer.line': ['haiccing.basePackageRns.logEntry'] }, 'the aliases generated for the read, said with the answer')
  t.alike(plain(readAs(writer, typeOf(line), value)), { timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' }, 'read as the line: key skipped')
  t.ok(is(writer, typeOf({ ...entry, fields: [...entry.fields, { name: 'more', type: 'int', default: 0 }] })).is, 'is: a version of the same type, evolved within the rules')
  t.ok(is(writer, typeOf({ ...line, aliases: ['haiccing.basePackageRns.logEntry'] })).is, 'is: a declared alias')
  const box = typeOf({ type: 'record', name: 'a.Box', fields: [{ name: 'in', type: ['null', { type: 'record', name: 'a.Small', fields: [{ name: 'x', type: 'int' }] }] }] })
  const other = typeOf({ type: 'record', name: 'b.Box', fields: [{ name: 'in', type: ['null', { type: 'record', name: 'b.Other', fields: [{ name: 'y', type: 'int' }] }, { type: 'record', name: 'b.Fits', fields: [{ name: 'x', type: 'long' }] }] }] })
  t.alike(plain(readAs(box, other, { in: { x: 1 } })), { in: { 'b.Fits': { x: 1 } } }, 'a union\'s branch by structure, the first that fits (two records: wrapped, as AVRO\'s JSON)')
  t.alike(isLike(box, other).aliases, { 'b.Fits': ['a.Small'] }, 'aliases only where the core type differs (box is box)')
})

test('the logical types: json, any JSON value in memory; timestamp-millis, its ISO text', (t) => {
  const named = {}
  const json = typeOf({ type: 'record', name: 'haiccing.baseComponentAvroRegistry.json', logicalType: 'json', fields: [{ name: 'text', type: 'string' }] }, named)
  const form = typeOf({ type: 'record', name: 'a.Form', fields: [{ name: 'args', type: 'haiccing.baseComponentAvroRegistry.json' }, { name: 'at', type: { type: 'long', logicalType: 'timestamp-millis' } }] }, named)
  const value = { args: { any: [1, 'two', null, { three: true }] }, at: '2026-11-26T10:00:00.000Z' }
  t.alike(valid(form, value), { valid: true }, 'a free-form value at a named edge, a timestamp as its ISO text')
  t.alike(plain(readAs(form, form, value)), value, 'through AVRO and back: the same')
  t.alike(plain(json.fromBuffer(json.toBuffer([1, { a: null }]))), [1, { a: null }], 'json: any JSON value')
  t.absent(valid(form, { args: 1, at: 'not a time' }).valid, 'a timestamp that is none: not valid')
})
