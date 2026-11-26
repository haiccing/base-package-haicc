// A request as the runtime package's types have it, made and brought
// forward by lib/request.js: each function a new request, none changed.
// Its check against the types themselves is the runtime package's
// (its test/types): a type is a package's, not a module's.
import test from 'brittle'
import { asked, filled, understood, noted, measured, returned, isReturned, STATUS, NONE } from '../index.js'

const PROTOCOLS = { crud: { default: 'read', actions: { read: { uris: ['**'] } } }, haicc: { default: 'goto', actions: { goto: { uris: ['**'], command: true } } } }
const EMPTY = { log: [], metrics: null, changed: [], waiting: null, sent: null, continuation: null }

test('asked: a request as it arrives, the line as typed, who asked and where its answer goes its own', (t) => {
  const r = asked('crud/read swarms', { from: 'terminal', to: 'local/host', reply: '/haicc/terminal' })
  t.alike(r, { command: 'crud/read swarms', from: 'terminal', to: 'local/host', reply: '/haicc/terminal', origin: null, form: null, processing: EMPTY, returned: null }, 'every field there: none until known')
  t.alike(asked('crud/read .'), { command: 'crud/read .', from: null, to: null, reply: null, origin: null, form: null, processing: EMPTY, returned: null }, 'the line alone')
  t.absent(isReturned(r), 'not completed')
  t.exception(() => asked(''), /not a command/, 'no line: said')
  t.exception(() => asked(['crud/read', '.']), /not a command/, 'a list of words: not a line')
})

test('understood: its form from its line, read by the one parser, where the writer stands; once', (t) => {
  const r = understood(asked('crud/read swarms'), PROTOCOLS, ['main'])
  t.alike(r.form, { protocol: 'crud', action: 'read', uri: ['main', 'swarms'], args: [], flags: NONE }, 'its protocol and action, its URI\'s segments, no arguments, no flags')
  t.is(r.command, 'crud/read swarms', 'the line kept as typed')
  t.alike(understood(asked('crud swarms/swarm-1'), PROTOCOLS).form, { protocol: 'crud', action: 'read', uri: ['main', 'swarms/swarm-1'], args: [], flags: NONE }, 'the protocol alone: its default action; where nothing says another, at main')
  t.alike(understood(asked('crud/create swarms/x \'{"kind":"swarm"}\' two --flags log=debug physical'), PROTOCOLS, ['main']).form, { protocol: 'crud', action: 'create', uri: ['main', 'swarms/x'], args: ['{"kind":"swarm"}', 'two'], flags: { ...NONE, log: 'debug', physical: true } }, 'a quoted word one argument, its quotes off; flags a text each, one that stands alone true')
  t.is(understood(r, {}, ['other']), r, 'understood already: as it is')
  t.exception(() => understood(asked('crud/read "swarms'), PROTOCOLS), /quote not closed/, 'a quote not closed: said')
  t.exception(() => understood(asked('nothing here'), PROTOCOLS), /no action/, 'no action to be told: said')
})

test('filled: a request whose form came filled in, no line', (t) => {
  const r = filled({ protocol: 'crud', action: 'read', uri: ['main', '.'], args: [1, 'two'], flags: { help: true } }, { from: 'local/host' })
  t.alike(r, { command: null, from: 'local/host', to: null, reply: null, origin: null, form: { protocol: 'crud', action: 'read', uri: ['main', '.'], args: ['1', 'two'], flags: { ...NONE, help: true } }, processing: EMPTY, returned: null }, 'its arguments texts, its flags the record, a field a flag')
  t.exception(() => filled({ protocol: 'crud' }), /not a form/, 'not a form: said')
})

test('noted, measured: an entry a line, its metrics; a new request each, the one given unchanged', (t) => {
  const a = asked('crud/read .')
  const b = noted(a, 'info', 'request.sent', 'Sent on to swarms/swarm-1, local/host.', '2026-11-26T10:00:00.000Z')
  const c = measured(b, { ms: 12, reads: 2 })
  t.alike(b.processing.log, [{ time: '2026-11-26T10:00:00.000Z', level: 'info', event: 'request.sent', line: 'Sent on to swarms/swarm-1, local/host.' }], 'when, how grave, what kind, and a line')
  t.alike(c.processing.metrics, { ms: 12, reads: 2, selects: 0, puts: 0, removes: 0, commits: 0 }, 'its metrics, each named')
  t.alike(a.processing, EMPTY, 'the first unchanged')
  t.ok(/^\d{4}-\d\d-\d\dT/.test(noted(a, 'info', 'x', 'A line.').processing.log[0].time), 'no time given: now')
})

test('returned: completed, done or failed, with what is said; its attachments by their base', (t) => {
  t.alike(STATUS, ['done', 'failed'], 'two statuses')
  const a = asked('boot/deploy host haiccing/base-component-haicc')
  const d = returned(a, 'done', 'Deployed host as local/host.\nIts service is started.')
  t.alike(d.returned, { status: 'done', message: 'Deployed host as local/host.\nIts service is started.', attachments: [] }, 'done: a message, no data')
  t.ok(isReturned(d), 'completed')
  t.is(a.returned, null, 'the first unchanged')
  t.alike(returned(a, 'failed', 'Refused here: no action boot deploy.').returned.status, 'failed', 'failed: said why')
  t.alike(returned(a, 'done', 'Two nodes at swarms.', [{ name: 'The nodes at swarms', type: 'haiccing/base-package-crud/nodes', at: 'local/host/attachments/1/0', value: [1] }]).returned.attachments, [{ name: 'The nodes at swarms', type: 'haiccing/base-package-crud/nodes', at: 'local/host/attachments/1/0' }], 'an attachment: its name, its type, where its value is; its value not in its base')
  t.exception(() => returned(a, 'unchanged', 'x'), /not a status/, 'another status: refused')
  t.exception(() => returned(a, 'done', ' '), /nothing said/, 'no message: refused')
  t.exception(() => returned(d, 'done', 'Again.'), /returned already/, 'completed already: refused')
})
