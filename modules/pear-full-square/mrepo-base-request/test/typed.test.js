// A request record as AVRO, the cascade: written, read back as JSON holds
// it; the action's own for its output when given; a node's log a topic of
// them.
import test from 'brittle'
import { registry, decode, fingerprintIn, unfold, plain } from 'mycelium-value-avro'
import { record, wrap, complete, encodeRecord, decodeRecord, logHandler, REQUEST } from '../index.js'

const like = v => JSON.parse(JSON.stringify(v))

test('typed: a completed request record as AVRO, read back as JSON holds it; smaller', (t) => {
  const reg = registry()
  const core = record('/local/host/outbox', { protocol: 'crud', action: 'read', uri: ['main', 'swarms'], args: [], flags: { log: 'verbose' }, command: ['crud/read', 'swarms'], interpreted: true }, '0b5c9a4e-3f0e-4c47-9a3b-2b4c1d2e3f40')
  const done = complete(core, { ok: true, value: [{ uri: ['main', 'swarms'], value: {}, children: ['swarm-1'] }] }, [{ level: 'info', event: 'read', time: '2026-11-21T10:00:00.000Z', nodes: 1 }, { level: 'verbose', event: 'step', time: '2026-11-21T10:00:00.004Z', ms: 3, what: { a: [1] } }])
  const bytes = encodeRecord(reg, done)
  t.alike(like(decodeRecord(reg, bytes)), like(done), 'the same record back: its form, its output, its log, its other fields')
  t.ok(bytes.length < Buffer.byteLength(JSON.stringify(done)), `smaller than its JSON (${bytes.length} B, ${Buffer.byteLength(JSON.stringify(done))} B)`)
  const levels = [decode(reg, bytes)]
  levels.push(decode(reg, levels[0].value))
  t.alike([fingerprintIn(bytes), fingerprintIn(levels[0].value), fingerprintIn(levels[1].output)].map(f => reg.get(f).uri), ['pear-full-square/mycelium-value-avro/record', REQUEST, 'pear-full-square/mycelium-value-avro/json'], 'the record, the request and its response, its output (json: no schema of its own given)')
  t.is(like(plain(unfold(reg, bytes))).value.output[0].children[0], 'swarm-1', 'every level unfolded, as info and crud/read show it')
})

test('typed: an error, null output, a continuation, an envelope around the core', (t) => {
  const reg = registry()
  const failed = complete(record(null, { protocol: 'boot', action: 'deploy', uri: ['main', 'x'], args: ['haiccing/a'] }, 'k1'), { ok: false, error: 'in the way: x' })
  t.alike(like(decodeRecord(reg, encodeRecord(reg, failed))), like(failed), 'an error')
  const nothing = complete(record('/t', { protocol: 'p', action: 'a', uri: ['.'], args: [] }, 'k2'), { ok: true, value: null, continuation: { at: '.', script: 'haicc . x/y' } })
  const back = decodeRecord(reg, encodeRecord(reg, nothing))
  t.ok('output' in back.value && back.value.output === null, 'an output of null: still a completed form')
  t.alike(back.value.continuation, { at: '.', script: 'haicc . x/y' })
  const envelope = wrap('/local/host/outbox', nothing)
  t.alike(like(decodeRecord(reg, encodeRecord(reg, envelope))), like(envelope), 'an envelope: a level more')
})

test('typed: the action\'s own schema for its output, when its output is valid as it; a node\'s log a handler', (t) => {
  const reg = registry()
  reg.add({ type: 'record', name: 'haiccing.basePackageHelp.annotateAnswer', fields: [{ name: 'help', type: 'string' }, { name: 'answer', type: { type: 'array', items: 'string' } }] })
  const h = logHandler(reg, { output: 'haiccing/base-package-help/annotate-answer' })
  const rec = complete(record('/x', { protocol: 'help', action: 'annotate', uri: ['main', '.'], args: ['crud/read'] }, 'k3'), { ok: true, value: { help: 'crud/read .', answer: ['a line'] } })
  const bytes = h.encode(rec)
  t.is(h.extension, 'avro')
  t.is(reg.get(fingerprintIn(decode(reg, decode(reg, bytes).value).output)).uri, 'haiccing/base-package-help/annotate-answer', 'its output as the action\'s own')
  t.alike(like(h.decode(bytes)), like(rec))
  const odd = complete(record('/x', { protocol: 'help', action: 'annotate', uri: ['main', '.'], args: [] }, 'k4'), { ok: true, value: { run: false, why: ['x'] } })
  t.is(reg.get(fingerprintIn(decode(reg, decode(reg, h.encode(odd)).value).output)).uri, 'pear-full-square/mycelium-value-avro/json', 'an output not valid as it: json')
})
