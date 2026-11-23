import test from 'brittle'
import { mkdtempSync, rmSync, readdirSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { documents } from 'mycelium-container-document'
import * as avro from '../index.js'

const { encode, fingerprintIn, registry } = avro

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
  const t1 = avro.typeOf({ ...ANSWER, doc: 'kept out', fields: ANSWER.fields.map(f => ({ ...f, doc: 'out' })) })
  const t2 = avro.typeOf(ANSWER)
  t.is(avro.fingerprint(t1), avro.fingerprint(t2), 'docs are not part of it')
  t.is(avro.canonicalOf(t2), '{"name":"haiccing.basePackageHelp.annotateAnswer","type":"record","fields":[{"name":"help","type":"string"},{"name":"does","type":["null","string"]},{"name":"answer","type":{"type":"array","items":"string"}}]}')
  t.ok(avro.isFingerprint(avro.fingerprint(t2)))
})

test('a name is its URI, exact both ways', (t) => {
  t.is(avro.fullnameOf('haiccing/base-package-help/annotate-answer'), 'haiccing.basePackageHelp.annotateAnswer')
  t.is(avro.uriOf('haiccing.basePackageHelp.annotateAnswer'), 'haiccing/base-package-help/annotate-answer')
  t.is(avro.uriOf('pearFullSquare.myceliumValueAvro.record'), 'pear-full-square/mycelium-value-avro/record')
  t.is(avro.uriOf('org.apache.avro.Thing_1'), null, 'a name from elsewhere: no URI')
  t.is(avro.uriOf('Plain'), null)
  t.exception(() => avro.fullnameOf('haiccing/node-1/x'), /data name/, 'a segment that is no data name')
})

test('a value to bytes and back, single-object encoded', (t) => {
  const reg = avro.registry()
  const h = avro.avro(reg, ANSWER)
  const v = { help: 'boot/deploy . x', does: 'deploys é', answer: ['a', 'b'] }
  const bytes = h.encode(v)
  t.is(bytes[0], 0xc3); t.is(bytes[1], 0x01)
  t.is(avro.fingerprintIn(bytes), avro.fingerprint(avro.typeOf(ANSWER)), 'the writer named by its fingerprint')
  t.alike({ ...h.decode(bytes) }, v)
  t.alike({ ...avro.avro(reg).decode(bytes) }, v, 'read as written, with no schema of its own')
  t.is(h.extension, 'avro')
  t.ok(bytes.length < Buffer.byteLength(JSON.stringify(v)), `smaller than its JSON (${bytes.length} B)`)
  t.exception(() => avro.avro(reg).encode(v), /reads only/)
})

test('an unknown fingerprint is an error where it is read', (t) => {
  const bytes = avro.encode(avro.registry(), ANSWER, { help: 'x', answer: [] })
  t.exception(() => avro.decode(avro.registry(), bytes), /unknown schema/)
  t.exception(() => avro.decode(avro.registry(), Buffer.from('{}')), /single-object/)
})

test('the registry: an index, by fingerprint and by URI, never refusing; its core types, their variants, their versions', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'avro-'))
  try {
    const reg = avro.registry(join(dir, 'schemas'))
    const a = reg.add(ANSWER)
    t.is(a.uri, 'haiccing/base-package-help/annotate-answer')
    t.ok(a.added)
    t.absent(reg.add(ANSWER).added, 'the same schema twice: one entry')
    const v2 = reg.add({ ...ANSWER, fields: [...ANSWER.fields, { name: 'more', type: 'string', default: '' }] })
    t.not(v2.fingerprint, a.fingerprint, 'a new version, a new fingerprint')
    t.alike(reg.named(a.uri), [a.fingerprint, v2.fingerprint], 'versions side by side, the oldest first')
    const variant = reg.add({ ...ANSWER, name: 'splectral.baseComponentHelpViewer.annotateAnswer' }, { commit: 'c2' })
    t.ok(reg.types().includes('annotateAnswer'), 'what core types there are')
    t.alike(reg.variants('annotateAnswer'), [{ variant: 'haiccing.basePackageHelp', uri: a.uri }, { variant: 'splectral.baseComponentHelpViewer', uri: variant.uri }], 'the variants of a type, by namespace')
    t.alike(reg.versions(variant.uri), [{ fingerprint: variant.fingerprint, commit: 'c2' }], 'the versions of a variant, by fingerprint, with the commit that brought it')
    const other = reg.add({ type: 'record', name: 'org.example.Thing_1', fields: [{ name: 'x', type: 'int' }] })
    t.is(other.uri, null, 'a valid schema from elsewhere: taken, known by its fingerprint')
    t.ok(reg.add('long').fingerprint, 'a schema with no name: taken')
    const refers = { type: 'record', name: 'a.Refers', fields: [{ name: 'j', type: 'pearFullSquare.myceliumValueAvro.json' }] }
    t.ok(reg.add(refers).added, 'a schema naming a type the registry knows')
    t.absent(reg.add(refers).added, 'the same again: one entry')
    t.exception(() => reg.add({ type: 'record', name: 'X', fields: [{ name: 'a', type: 'nope' }] }), 'an invalid schema is not one')
    // another process: the same folder
    const again = avro.registry(join(dir, 'schemas'))
    t.alike(again.get(a.fingerprint).schema.name, ANSWER.name, 'read from the folder')
    t.alike(again.named(a.uri), [a.fingerprint, v2.fingerprint], 'in the order they were added')
    t.alike(again.versions(variant.uri)[0].commit, 'c2')
    t.is(documents(join(dir, 'schemas'), { extension: 'json' }).list().length, readdirSync(join(dir, 'schemas')).length)
    t.ok(again.list().some(e => e.uri === 'pear-full-square/mycelium-value-avro/record'), 'its own schemas always known')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('is-like: read as the reader needs, record names not required to match', (t) => {
  const reg = avro.registry()
  const bytes = avro.encode(reg, ANSWER, { help: 'h', does: null, answer: ['x'] })
  const reader = { type: 'record', name: 'org.other.help', fields: [{ name: 'help', type: 'string' }, { name: 'lines', type: 'long', default: 3 }, { name: 'answer', type: { type: 'array', items: 'string' } }] }
  t.alike({ ...avro.decode(reg, bytes, { as: reader }) }, { help: 'h', lines: 3, answer: ['x'] }, 'the writer\'s extra skipped, the reader\'s missing from its default')
  t.ok(avro.isLike(reg, avro.fingerprintIn(bytes), reader).like)
  const not = avro.isLike(reg, avro.fingerprintIn(bytes), { type: 'record', name: 'N', fields: [{ name: 'size', type: 'int' }] })
  t.absent(not.like, 'a field it needs, with no default: not like it')
  t.ok(not.why)
  const n = avro.encode(reg, { type: 'record', name: 'a.B', fields: [{ name: 'n', type: 'int' }, { name: 'inner', type: { type: 'record', name: 'a.C', fields: [{ name: 'x', type: 'int' }] } }] }, { n: 5, inner: { x: 1 } })
  const wide = { type: 'record', name: 'z.Y', fields: [{ name: 'n', type: 'double' }, { name: 'inner', type: { type: 'record', name: 'z.W', fields: [{ name: 'x', type: 'long' }] } }] }
  t.alike(JSON.parse(JSON.stringify(avro.decode(reg, n, { as: wide }))), { n: 5, inner: { x: 1 } }, 'numbers widened, a record inside by its field')
})

test('is and is-like, one mechanism: a core type\'s variant read as AVRO is; a different core type, the log viewer\'s line, reading a node\'s log entry, its key skipped; the aliases applied said', (t) => {
  const reg = registry()
  const entry = { type: 'record', name: 'haiccing.basePackageRns.logEntry', fields: [{ name: 'key', type: 'string' }, { name: 'timestamp', type: 'long' }, { name: 'uri', type: 'string' }, { name: 'output', type: ['null', 'string'], default: null }] }
  const line = { type: 'record', name: 'splectral.baseComponentLogViewer.line', fields: [{ name: 'timestamp', type: 'long' }, { name: 'uri', type: 'string' }, { name: 'output', type: ['null', 'string'], default: null }] }
  const bytes = encode(reg, entry, { key: 'k', timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' })
  const fp = fingerprintIn(bytes)
  const variant = { ...line, name: 'splectral.baseComponentLogViewer.logEntry' }
  t.ok(avro.is(reg, fp, variant).is, 'is: one core type (logEntry), another variant (its namespace): read as AVRO reads it')
  t.alike(avro.isLike(reg, fp, variant).aliases, {}, 'no alias generated for a variant')
  t.alike({ ...avro.decode(reg, bytes, { as: variant }) }, { timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' }, 'the variant reads it, key skipped')
  t.absent(avro.is(reg, fp, line).is, 'is: not the same core type')
  const like = avro.isLike(reg, fp, line)
  t.ok(like.like, 'is-like: the same thing, with less detail')
  t.alike(like.aliases, { 'splectral.baseComponentLogViewer.line': ['haiccing.basePackageRns.logEntry'] }, 'the aliases generated for the read, said with the answer')
  t.alike({ ...avro.decode(reg, bytes, { as: line }) }, { timestamp: 5, uri: 'swarm-1/node-2', output: 'ok' }, 'read as the line: key skipped')
  t.ok(avro.is(reg, fp, { ...entry, fields: [...entry.fields, { name: 'more', type: 'int', default: 0 }] }).is, 'is: a version of the same type, evolved within the rules')
  t.ok(avro.is(reg, fp, { ...line, aliases: ['haiccing.basePackageRns.logEntry'] }).is, 'is: a declared alias')
  const u = encode(reg, { type: 'record', name: 'a.Box', fields: [{ name: 'in', type: ['null', { type: 'record', name: 'a.Small', fields: [{ name: 'x', type: 'int' }] }] }] }, { in: { x: 1 } })
  const ur = { type: 'record', name: 'b.Box', fields: [{ name: 'in', type: ['null', { type: 'record', name: 'b.Other', fields: [{ name: 'y', type: 'int' }] }, { type: 'record', name: 'b.Fits', fields: [{ name: 'x', type: 'long' }] }] }] }
  t.alike(JSON.parse(JSON.stringify(avro.decode(reg, u, { as: ur }))), { in: { 'b.Fits': { x: 1 } } }, 'a union\'s branch by structure, the first that fits (two records: wrapped, as AVRO\'s JSON)')
  t.alike(avro.isLike(reg, fingerprintIn(u), ur).aliases, { 'b.Fits': ['a.Small'] }, 'aliases only where the core type differs (box is box)')
})

test('the cascade: each level carrying the next, unfolded', (t) => {
  const reg = avro.registry()
  const answer = avro.encode(reg, ANSWER, { help: 'h', does: null, answer: ['x'] })
  const json = avro.encode(reg, 'pear-full-square/mycelium-value-avro/json', { any: [1, 'two', null, { three: true }] })
  const inner = avro.encode(reg, { type: 'record', name: 'a.Form', fields: [{ name: 'args', type: 'bytes' }, { name: 'output', type: ['null', 'bytes'] }] }, { args: json, output: answer })
  const ts = '2026-11-21T10:00:00.123Z'
  const rec = avro.encode(reg, 'pear-full-square/mycelium-value-avro/record', { topic: '/x/inbox', key: 'k', timestamp: ts, headers: { by: 'test', n: [1] }, value: inner })
  const out = JSON.parse(JSON.stringify(avro.unfold(reg, rec)))
  t.alike(out, { topic: '/x/inbox', key: 'k', timestamp: ts, headers: { by: 'test', n: [1] }, value: { args: { any: [1, 'two', null, { three: true }] }, output: { help: 'h', does: null, answer: ['x'] } } })
  t.ok(avro.isSingle(avro.decode(reg, rec).value), 'one level read: the next still bytes')
})
