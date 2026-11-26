import test from 'brittle'
import { readdirSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { fileURLToPath } from 'bare-url'
import { check, matches, missing, hookOf, parse, words, record, tick, continuationOf, CEILING, logger, LEVELS, FLAGS, LAYER, layerOf, modeOf, flagsOf, sorted, chained, rewrites, problems, interpret, read, carrying, lineOf, NONE, typed, relative, from, within, slashed, unslashed, segmented, joined, ROOT, MAIN, STANDING, send } from '../index.js'

// The protocols as a runtime loaded them: each action's URIs (patterns
// written at main, where the outside stands), and the states that allow it
// where it names them (the service's own).
const at1 = states => ({ uris: ['.'], states })
const protocols = {
  service: { actions: { initialise: at1(['booted']), start: at1(['initialised']), stop: at1(['started']), shutdown: at1(['initialised']) } },
  rest: { actions: { get: { uris: ['**'] }, put: { uris: ['<name>/**'] }, delete: { uris: ['<name>/**'] } } },
  help: { actions: { get: { uris: ['.'] } } }
}
// the active ones: service and help always; rest once the service is started
// (as hooks on boot, start and stop would have it)
const activeAt = state => Object.fromEntries(['service', 'help', ...(state === 'started' ? ['rest'] : [])].map(n => [n, protocols[n]]))
const at = state => ({ service: { state }, protocols, active: activeAt(state) })
// its fourth: a document, the rest put's argument (JSON text)
// (a form as the mrepo holds it: its URI given here from the root, as one
// string, made its segments: the prefix main, then the rest)
const seg = u => (Array.isArray(u) ? u : u === 'main' ? ['main', '.'] : u.startsWith('main/') ? ['main', u.slice(5)] : [u])
const req = (protocol, action, uri, doc) => ({ protocol, action, uri: seg(uri), ...(doc !== undefined ? { args: [JSON.stringify(doc)] } : {}) })

test('a URI in a request: where its writer stands; inside, an array of segments', (t) => {
  t.alike([ROOT, MAIN, STANDING], ['.', 'main', ['main']], 'where a request stands when nothing says another: main, whoever asks')
  t.alike([segmented(['main', 'host']), joined(['main', 'host']), joined(['main', '.']), joined(['.'])], [['main', 'host'], 'main/host', 'main', '.'], 'the URI functions, mycelium-uri\'s, offered here too')
  t.alike([from(MAIN, relative('host')), within(MAIN, 'main/host'), slashed('main/host'), unslashed('/packages')], ['main/host', 'host', '/main/host', 'packages'])
})

test('a command interpreted: its parts, the default action, the URI its segments', (t) => {
  t.alike(interpret(['boot/deploy', 'host', 'haiccing/base-component-haicc'], {}, STANDING), { protocol: 'boot', action: 'deploy', uri: ['main', 'host'], args: ['haiccing/base-component-haicc'] }, 'an array of parts; written from outside: the prefix main, then the URI as it is, two segments')
  t.alike(interpret(words('help/get . packages oneliner'), {}, STANDING), { protocol: 'help', action: 'get', uri: ['main', '.'], args: ['packages', 'oneliner'] }, 'a string, split at its spaces; . is the position itself')
  t.alike(interpret(['service/initialise'], {}, STANDING), { protocol: 'service', action: 'initialise', uri: ['main', '.'], args: [] }, 'no URI: the position itself')
  t.alike(interpret(['boot/deploy', 'swarms/swarm-1/node-1', 'x'], {}, STANDING).uri, ['main', 'swarms/swarm-1/node-1'], 'a URI of several name parts: one segment, whole')
  t.alike(interpret(['protocol/activate', '.', 'help']), { protocol: 'protocol', action: 'activate', uri: ['main', '.'], args: ['help'] }, 'nothing said of where it stands: main, the mrepo\'s own too')
  t.alike(interpret(['crud/read', '.'], {}, ['main', 'swarms/swarm-1']).uri, ['main', 'swarms/swarm-1', '.'], 'at a position: the parts before its URI, kept apart')
  t.alike(interpret(['boot/deploy', './host', 'x'], {}, STANDING).uri, ['main', 'host'], './host is host')
  t.alike(interpret(['haicc', 'host', 'service/start'], { haicc: { default: 'goto' } }, STANDING), { protocol: 'haicc', action: 'goto', uri: ['main', 'host'], args: ['service/start'] }, 'the protocol alone: its default action; what follows, its arguments')
  t.exception(() => interpret(['boot/deploy', '/host', 'x'], {}, STANDING), /not a relative URI: \/host/)
  t.exception(() => interpret(['service']), /no action: service \(service has no default action\)/)
  t.exception(() => interpret([]), /not a command/)
  t.exception(() => interpret(['a/b/c']), /not a command: a\/b\/c/)
  t.exception(() => interpret(['boot/deploy', 7]), /not a command/)
})

test('missing: what an action\'s config asks for and the request does not give', (t) => {
  const deploy = { uris: ['<name>'], target: true, args: ['package'] }
  const redeploy = { uris: ['<name>'], target: true, args: ['package?'] }
  t.is(missing(deploy, ['main', 'host'], ['haiccing/x']), null, 'all given')
  t.is(missing(deploy, ['main', '.'], ['haiccing/x']), 'missing argument: target', 'a target needed: . as it was written is the position itself, the mrepo')
  t.is(missing(deploy, ['main', 'swarms/swarm-1', '.'], ['haiccing/x']), 'missing argument: target', 'at a position: the same, what was written is the last part')
  t.is(missing(deploy, ['runtime', 'host'], ['haiccing/x']), null, 'in another layer: a target')
  t.is(missing(deploy, ['main', 'host'], []), 'missing argument: package', 'an argument, by its name')
  t.is(missing(deploy, ['main', '.'], []), 'missing argument: target', 'the target first')
  t.is(missing(redeploy, ['main', 'host'], []), null, 'one ending in ?: optional')
  t.is(missing({ uris: ['**'] }, ['main', '.'], []), null, 'no target asked for: the position itself will do')
  t.is(missing(undefined, ['main', '.'], []), null, 'no config: nothing asked')
  const p = { boot: { actions: { deploy } } }
  const open = { service: null, protocols: p, active: p }
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', '.'] }, open), 'missing argument: target', 'said before the URI is said not offered')
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', '.'] }, { ...open, active: {} }), 'missing argument: target', 'and before the protocol is said not active')
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', 'host'] }, open), 'missing argument: package')
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', 'host'], args: ['x'] }, open), null)
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', '.'] }, open, { internal: true }), 'missing argument: target', 'the mrepo\'s own too')
  t.is(check({ protocol: 'boot', action: 'deploy', uri: ['main', 'host'], args: ['x'] }, open, { internal: true }), null, 'its own: a target given')
})

test('matches: a URI against a config\'s pattern', (t) => {
  t.ok(matches('.', '.') && !matches('.', 'a'))
  t.ok(matches('<name>', 'host') && !matches('<name>', '.') && !matches('<name>', 'a/b'))
  t.ok(matches('swarms/**', 'swarms') && matches('swarms/**', 'swarms/a/b.json') && !matches('swarms/**', 'nodes/x'))
  t.ok(matches('**', '.') && matches('**', 'anything/at/all'))
  t.ok(matches('<name>/**', 'a') && matches('<name>/**', 'a/b') && !matches('<name>/**', '.'), 'anything below, not the position itself')
})

test('check: canonical, loaded, offered there', (t) => {
  t.is(check(req('rest', 'get', 'main'), at('started')), null)
  t.is(check(req('rest', 'put', 'main/a/b.json', 1), at('started')), null, 'deep')
  t.is(check(req('rest', 'get', 'main/Main'), at('started')), 'not canonical: Main (main)')
  t.is(check({ protocol: 'rest', action: 'get', uri: 'main/a' }, at('started')), 'not a URI: its segments, an array', 'a form\'s URI is its segments, never one string')
  t.is(check({ protocol: 'rest', action: 'get', uri: ['main', 'a', 'b'] }, at('started')), null, 'a position in main and the URI written there: together the URI the config is asked about')
  t.is(check({ protocol: 'rest', action: 'put', uri: ['main', 'a', '.'] }, at('started')), null, 'written at a position, the position itself: a/. is a')
  t.is(check({ protocol: 'help', action: 'get', uri: ['main', 'a', '.'] }, at('started')), 'not offered: help get at a', 'not offered at that position')
  t.is(check({ protocol: 'rest', action: 'get', uri: ['runtime', 'a', 'b'] }, at('started')), 'not offered: rest get at runtime/a/b', 'the outside reaches main only')
  t.is(check(req('rest', 'get', ['main', "a/*[state='started']"]), at('started')), null, 'a URI that selects, with a filter')
  t.is(check(req('rest', 'get', ['main', '/a']), at('started')), 'not a relative URI: /a (no leading slash: a)', 'a leading slash: refused')
  t.ok(check(req('rest', 'get', 'main/a_b'), at('started')), 'a bad URI: refused')
  t.is(check(req('rest', 'put', 'main', 1), at('started')), 'not offered: rest put at .')
  t.is(check(req('rest', 'get', 'packages'), at('started')), 'not offered: rest get at packages', 'not in main: nothing outside it is offered')
  t.is(check(req('rest', 'get', '.'), at('started')), 'not offered: rest get at .', 'the root neither')
  t.is(check(req('rest', 'post', 'main/x.json', 1), at('started')), 'no action: rest post (delete, get, put)', 'an action that is not there: said with those that are')
  t.is(check(req('other', 'get', 'main'), at('started')), 'no protocol: other (help, rest, service)', 'a protocol that is not loaded: said with the active ones')
  t.is(check(null, at('started')), 'not a request')
})

test('check: nothing is active by default; a request from outside only for an active protocol', (t) => {
  t.is(check(req('rest', 'get', 'main'), { service: null, protocols, active: {} }), 'not now: rest get (rest is not active)', 'loaded, not active: not from outside; no service')
  t.is(check(req('rest', 'get', 'main'), { service: null, protocols }), 'not now: rest get (rest is not active)', 'no protocols layer at all: nothing active')
  t.is(check(req('rest', 'get', 'main'), { service: null, protocols, active: { rest: protocols.rest } }), null, 'activated (a boot hook): accepted, without any service')
  t.is(check(req('help', 'get', 'main'), at('booted')), null, 'active from boot: open whatever the service\'s state')
  t.is(check(req('help', 'get', 'main'), at('started')), null)
  t.is(check(req('rest', 'get', 'main'), at('booted')), 'not now: rest get (rest is not active; the service is booted)', 'behind the service\'s door: activated by its start')
  t.is(check(req('rest', 'get', 'main'), at('initialised')), 'not now: rest get (rest is not active; the service is initialised)')
  t.is(check(req('rest', 'get', 'main'), at('started')), null, 'started: active')
})

test('check: the service\'s own actions, each in its state', (t) => {
  t.is(check(req('service', 'initialise', 'main'), at('booted')), null)
  t.is(check(req('service', 'start', 'main'), at('booted')), 'not now: service start (the service is booted)')
  t.is(check(req('service', 'start', 'main'), at('initialised')), null)
  t.is(check(req('service', 'shutdown', 'main'), at('initialised')), null)
  t.is(check(req('service', 'stop', 'main'), at('started')), null)
  t.is(check(req('service', 'shutdown', 'main'), at('started')), 'not now: service shutdown (the service is started)')
  t.is(check(req('service', 'start', 'main/host'), at('initialised')), 'not offered: service start at host')
})

test('check at the inbox: neither the activation nor the state (the queue may change them first)', (t) => {
  const inbox = { state: false }
  t.is(check(req('service', 'start', 'main'), at('booted'), inbox), null, 'start behind a queued initialise')
  t.is(check(req('rest', 'put', 'main/x.json', 1), at('booted'), inbox), null, 'loaded and offered there; not active yet: not checked until it executes')
  t.is(check(req('rest', 'put', 'main', 1), at('initialised'), inbox), 'not offered: rest put at .', 'not offered there: refused at once')
  t.is(check(req('service', 'fly', 'main'), at('booted'), inbox), 'no action: service fly (initialise, shutdown, start, stop)')
  t.is(check(req('other', 'get', 'main'), at('booted'), inbox), 'no protocol: other (help, service)', 'not loaded: refused at once')
})

test('hooks: a file a transition, its lines simple commands; a script\'s lines, split as the shell splits them', async (t) => {
  const files = { '/runtime/hooks/boot.haicc': Buffer.from('protocol/activate . info\ninfo/extract\n') }
  const reader = { find: async p => files[p] ?? null }
  t.is(await hookOf(reader, 'boot'), 'protocol/activate . info\ninfo/extract\n', 'its text')
  t.is(await hookOf(reader, 'stop'), null, 'none dropped in: none')
  t.is(await hookOf({ read: async p => { if (!files[p]) throw new Error('none'); return files[p] } }, 'boot'), 'protocol/activate . info\ninfo/extract\n', 'read from the repository the same')
  await t.exception(hookOf(reader, 'reboot'), /not a transition: reboot \(boot, commission, initialise, start, stop, shutdown, decommission\)/)
  t.alike(parse('# a comment\n\nservice/initialise\n  service/start  ').map(l => [l.n, l.words]), [[3, ['service/initialise']], [4, ['service/start']]], 'blank lines and comments skipped, each line its number')
  t.alike(words(`crud/create a '{"n":1}'`), ['crud/create', 'a', '{"n":1}'], 'a quoted part one word')
  t.exception(() => parse('# only a comment'), /missing argument: script/)
})

test('a line sent: a request, the mrepo\'s own; its offset given back beside the request returned', async (t) => {
  const submitted = []
  const back = { returned: { status: 'done', message: 'Read.', attachments: [] } }
  const runtime = { uri: 'local/x', submit: async request => { submitted.push(request); return 1764000000123 }, answer: async () => back }
  t.alike(await send(runtime, ['crud/create', 'a b', '{"n":1}']), { offset: 1764000000123, request: back }, 'the request returned, and the offset it was given')
  t.alike([submitted[0].command, submitted[0].from, submitted[0].to, submitted[0].reply], ['crud/create "a b" "{\\"n\\":1}"', 'local/x', 'local/x', '/local/x/outbox'], 'its words written as a line; from and to the mrepo, its answer to its outbox')
  await send(runtime, 'crud/read .')
  t.is(submitted[1].command, 'crud/read .', 'a line: as typed')
  for (const w of [['a'], ['a b', ''], ['it\'s', '"q"', 'back\\slash', 'tab\there']]) t.alike(words(lineOf(w)), w, 'words written as a line read back the same')
  t.alike(await send({ own: async line => ({ line }) }, ['service/start']), { offset: null, request: { line: 'service/start' } }, 'the runtime\'s own: placed by it, no offset')
})

test('a script\'s command: its URI where its lines run, then the lines, one argument', (t) => {
  const f = interpret(['haicc/script', '.', 'service/initialise\nservice/start'])
  t.alike([f.uri, f.args], [['main', '.'], ['service/initialise\nservice/start']], 'its URI, then the lines as they were given')
})

test('flags: written after a command\'s URI, that step\'s; -- says where what follows starts', (t) => {
  const haicc = { haicc: { default: 'goto', actions: { goto: { command: true } } } }
  t.alike(flagsOf(['log=debug', 'error-on-empty', 'a=b=c']), { log: 'debug', 'error-on-empty': true, a: 'b=c' }, 'a flag alone, or key=value with no space; space separated')
  t.alike(interpret(['crud/read', 'swarms/*', '--flags', 'log=debug'], {}, STANDING), { protocol: 'crud', action: 'read', uri: ['main', 'swarms/*'], args: [], flags: { log: 'debug' } }, 'after the URI, to the end of the command')
  t.alike(interpret(words('crud/create swarms/s1 --flags log=verbose other -- \'{"n":1}\''), {}, STANDING), { protocol: 'crud', action: 'create', uri: ['main', 'swarms/s1'], args: ['{"n":1}'], flags: { log: 'verbose', other: true } }, 'or ended by --: the arguments go on after it')
  t.alike(interpret(['crud/create', 'swarms/s1', '{"n":1}', '--flags', 'log=debug'], {}, STANDING), { protocol: 'crud', action: 'create', uri: ['main', 'swarms/s1'], args: ['{"n":1}'], flags: { log: 'debug' } }, 'after its arguments: taken the same way')
  t.alike(interpret(['service/start', '--flags', 'log=debug'], {}, STANDING), { protocol: 'service', action: 'start', uri: ['main', '.'], args: [], flags: { log: 'debug' } }, 'no URI: the flags are not taken for one')
  t.absent('flags' in interpret(['crud/read', 'swarms'], {}, STANDING), 'none written: no flags in the form')
  // a command that passes its words on: the list after its URI is its own, -- where the next command starts
  t.alike(interpret(['haicc', 'host', '--flags', 'log=debug', '--', 'crud/read', '.'], haicc, STANDING), { protocol: 'haicc', action: 'goto', uri: ['main', 'host'], args: ['crud/read', '.'], flags: { log: 'debug' } }, 'haicc host --flags log=debug -- crud/read .: the step\'s at host')
  t.alike(interpret(['haicc', 'host', '--flags', 'nope', 'log=loud', '--', 'crud/read', '.'], haicc, STANDING), { protocol: 'haicc', action: 'goto', uri: ['main', 'host'], args: ['crud/read', '.'], flags: { nope: true, log: 'loud' } }, 'whatever is written before the --: a flag there is none of too (ignored later, with a warning)')
  t.alike(interpret(['haicc', 'host', 'crud/read', 'swarms', '--flags', 'log=debug'], haicc, STANDING), { protocol: 'haicc', action: 'goto', uri: ['main', 'host'], args: ['crud/read', 'swarms', '--flags', 'log=debug'] }, 'after the next command\'s URI: that command\'s, passed on as written')
  t.alike(interpret(['haicc', 'host', '--flags', 'log=info', '--', 'haicc', 'node-1', '--flags', 'log=debug', '--', 'crud/read', '.'], haicc, STANDING), { protocol: 'haicc', action: 'goto', uri: ['main', 'host'], args: ['haicc', 'node-1', '--flags', 'log=debug', '--', 'crud/read', '.'], flags: { log: 'info' } }, 'a list at each step, each closed by its --')
  t.exception(() => interpret(['haicc', 'host', '--flags', 'log=debug', 'crud/read', '.'], haicc, STANDING), /not a command: no command after the flags of haicc \(-- closes a flag list, the command follows it\)/, 'strict: only -- or the end of the command closes the list; not closed, the command was taken for flags: said')
  t.exception(() => interpret(['haicc', 'host', '--flags', 'log=debug'], haicc, STANDING), /no command after the flags of haicc/)
  t.exception(() => interpret(['haicc', 'host', '--flags', 'log=debug', '--'], haicc, STANDING), /no command after the flags of haicc/)
  t.exception(() => interpret(['--flags', 'log=debug', '--', 'crud/read', 'swarms']), /not a command: flags follow a command's URI/, 'in front of a command: not a place for them')
  // a flag holds through a chain until changed: what came with the request, under what its own command says
  t.absent('flags' in read(['service/start'], {}, STANDING))
  // main is the default layer of a request from outside; a flag changes it
  t.alike(read(['crud/read', 'done/*', '--flags', 'layer=request'], {}, STANDING).uri, ['request', 'done/*'], 'layer=request: the command\'s own URI read at that layer')
  t.alike(read(['crud/read', 'done/*'], {}, STANDING).uri, ['main', 'done/*'], 'without it: main, the default')
  t.alike(read(['crud/read', '.', '--flags', 'layer=request/done'], {}, ['main', 'swarms/swarm-1']).uri, ['request/done', 'swarms/swarm-1', '.'], 'a layer of several parts; written at a position: the layer in main\'s place')
  t.alike(read(['haicc', 'host', '--flags', 'layer=request', '--', 'crud/read', 'done/*'], haicc, STANDING).uri, ['main', 'host'], 'a command that passes on: its URI is a position, and positions are main\'s; the flag goes on with the command')
  t.alike(read(['crud/read', 'x', '--flags', 'layer=Not_A_Layer'], {}, STANDING).uri, ['main', 'x'], 'a value it does not take: main (ignored, with its warning)')
  t.alike(read(['crud/read', 'hooks', '--flags', 'layer=runtime'], {}).uri, ['runtime', 'hooks'], 'the mrepo\'s own the same way: the layer by its flag, first of its parts')
  t.alike([layerOf({ layer: 'request' }), layerOf({}), layerOf(undefined), layerOf({ layer: true }), LAYER], ['request', 'main', 'main', 'main', 'main'])
  t.is(check(read(['rest/get', 'done/r1', '--flags', 'layer=request'], protocols, STANDING), at('started')), null, 'checked at its layer: offered there as its config says')
  t.is(check({ protocol: 'rest', action: 'get', uri: ['request', 'done/r1'] }, at('started')), 'not offered: rest get at request/done/r1', 'another layer without the flag: not where it stands')
  t.alike(sorted({ layer: 'request/done' }), { flags: { layer: 'request/done' }, ignored: [] })
  t.is(sorted({ layer: true }).ignored[0].why, 'layer=: not a value it takes')
  // the enumeration: one that is not there, or a value its flag does not take, is ignored, and said
  t.alike(Object.keys(FLAGS), ['log', 'layer', 'container', 'help', 'feedback', 'physical'])
  t.alike([modeOf({}), modeOf(undefined), modeOf({ physical: true }), modeOf({ physical: 'yes' })], ['logical', 'logical', 'physical', 'logical'], 'how a URI is read: logical when nothing is said; physical where its flag is written, as it stands alone')
  t.alike(sorted({ log: 'verbose' }), { flags: { log: 'verbose' }, ignored: [] })
  const s = sorted({ log: 'loud', nope: true, other: 'x' })
  t.alike(s.flags, {}, 'ignored')
  t.alike(s.ignored.map(i => i.why), ['log=loud: not one of info, verbose, debug', 'no flag: nope (container, feedback, help, layer, log, physical)', 'no flag: other (container, feedback, help, layer, log, physical)'])
  t.alike(sorted({ log: true }).ignored.map(i => i.why), ['log=: not one of info, verbose, debug'], 'a flag that takes a value, written alone')
  t.alike(sorted(undefined), { flags: {}, ignored: [] })
  // in a form: a record, a field each flag there is, each its own type
  t.alike(NONE, { log: null, layer: null, container: false, help: false, feedback: null, physical: false }, 'none written: one that stands alone false, one that takes a value null')
  t.alike(typed({ log: 'debug', physical: true }), { ...NONE, log: 'debug', physical: true }, 'those written, each its type')
  t.alike([sorted(NONE), chained(typed({ log: 'debug' })), rewrites(typed({ help: true })).map(([f]) => f), layerOf(typed({ layer: 'request' })), modeOf(NONE)], [{ flags: {}, ignored: [] }, { log: 'debug' }, ['help'], 'request', 'logical'], 'read the same as written: null and false are not written')
})

test('the flag unit: a folder a flag, each listed, its declaration; what holds down a chain; strict: what keeps a command from being run', (t) => {
  const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'flags')
  const folders = readdirSync(here, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()
  t.alike(Object.keys(FLAGS).sort(), folders, 'every folder of flags/ listed, each listed one a folder')
  for (const [name, f] of Object.entries(FLAGS)) {
    t.ok(['modifier', 'option', 'rewrite'].includes(f.kind) && ['chain', 'step', 'last'].includes(f.scope), `${name}: its kind and its scope`)
    t.ok(f.values === null || Array.isArray(f.values) || f.values instanceof RegExp, `${name}: its values, a list, a pattern or none`)
    if (f.kind === 'rewrite') t.ok(typeof f.protocol === 'string' && typeof f.rewrite === 'function', `${name}: a rewrite names its protocol and how it rewrites`)
  }
  t.alike(chained({ log: 'debug', help: true, layer: 'request', nope: true }), { log: 'debug', layer: 'request', nope: true }, 'held down a chain: all but a step\'s or the last command\'s (one there is none of: carried, said where it arrives)')
  t.alike(rewrites({ log: 'debug', help: true }).map(([flag]) => flag), ['help'])
  // help: the command it is on becomes help/annotate at the same URI, before the door
  const both = { crud: { actions: { read: { uris: ['**'] } } }, help: { default: 'annotate', actions: { annotate: { uris: ['**'], args: ['command'] } } } }
  const help = read(['crud/read', 'swarms', 'x', '--flags', 'help', 'log=debug'], both, STANDING)
  t.alike([help.protocol, help.action, help.uri, help.args, help.flags], ['help', 'annotate', ['main', 'swarms'], ['crud/read', 'x'], { log: 'debug' }], 'help/annotate at its URI, its arguments the command\'s <protocol>/<action> and its own; its flag gone, the others kept')
  t.is(check(help, { service: null, protocols: both, active: { help: {} } }), null, 'the door checks the rewritten command')
  // strict: nothing of the command run, said why
  t.alike(problems(read(['crud/read', 'x', '--flags', 'nope', 'log=loud'], both, STANDING), both), ['no flag: nope (container, feedback, help, layer, log, physical)', 'log=loud: not one of info, verbose, debug'], 'a flag that is none; a value its flag does not take: each said')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'help=yes'], both, STANDING), both), ['help takes no value'], 'a value its flag does not take')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'help'], { crud: both.crud }, STANDING), { crud: both.crud }), ['help: no protocol help here'], 'a rewrite whose protocol is not here: not rewritten, said')
  const haicc = { ...both, haicc: { default: 'goto', actions: { goto: { command: true, uris: ['**'] } } } }
  t.alike(problems(read(['haicc', 'host', '--flags', 'help', '--', 'crud/read', 'x'], haicc, STANDING), haicc), ['help: on the last command only (it rewrites the command it is on)'], 'a rewrite on a command that passes on: not the last')
  t.alike(read(['haicc', 'host', 'crud/read', 'x', '--flags', 'help'], haicc, STANDING).args, ['crud/read', 'x', '--flags', 'help'], 'written after the last command\'s URI: that command\'s, passed on as written')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'log=debug'], both, STANDING), both), [], 'nothing in the way')
  // feedback: a rewrite, last, a tail: every word after it its text; the command becomes haici/feedback at the same URI
  const fb = { ...both, haici: { default: 'feedback', actions: { feedback: { uris: ['**'], args: ['text', 'command', 'arguments?'] } } } }
  t.ok(FLAGS.feedback.tail === true && FLAGS.feedback.kind === 'rewrite' && FLAGS.feedback.scope === 'last' && FLAGS.feedback.protocol === 'haici', 'feedback: a rewrite, last, a tail, its protocol haici')
  const f = read(['crud/read', 'swarms', 'x', '--flags', 'log=debug', 'feedback', 'the', 'list', 'is', 'empty'], fb, STANDING)
  t.alike([f.protocol, f.action, f.uri, f.args, f.flags], ['haici', 'feedback', ['main', 'swarms'], ['the list is empty', 'crud/read', 'x'], { log: 'debug' }], 'haici/feedback at its URI, its arguments the text, then the command\'s <protocol>/<action> and its own; the flags before it kept')
  t.is(check(f, { service: null, protocols: fb, active: { haici: {} } }), null, 'the door checks the rewritten command')
  t.alike(read(['crud/read', 'x', '--flags', 'feedback', 'a', '--', 'b', '--flags', 'nope', 'c=d'], fb, STANDING).args, ['a -- b --flags nope c=d', 'crud/read'], 'the tail: every word after it its text, a -- and words that look like flags too')
  t.alike(read(['crud/read', 'x', '--flags', 'feedback=first', 'and', 'more'], fb, STANDING).args[0], 'first and more', 'written feedback=<word>: that word the text\'s first')
  t.alike(read(['crud/read', 'x', '--flags', 'help', 'feedback', 'y'], fb, STANDING).flags, { help: true, feedback: 'y' }, 'the flags before it its list\'s (two rewrites: neither applied)')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'feedback'], fb, STANDING), fb), ['feedback: its text follows it (--flags feedback <text>)'], 'no text after it: not run, said')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'help', 'feedback', 'y'], fb, STANDING), fb), ['one rewrite at a time: help, feedback'], 'two rewrites: not run')
  t.alike(problems(read(['crud/read', 'x', '--flags', 'feedback', 'y'], both, STANDING), both), ['feedback: no protocol haici here'], 'its protocol not here: not rewritten, said')
  const fbh = { ...fb, haicc: haicc.haicc }
  const on = read(['haicc', 'host', '--flags', 'feedback', 'y', 'z', '--', 'crud/read', 'x'], fbh, STANDING)
  t.alike([on.args, problems(on, fbh)], [['crud/read', 'x'], ['feedback: on the last command only (it rewrites the command it is on)']], 'on a command that passes on: its -- closes it, the next command follows; not the last, not run')
  t.alike(read(['haicc', 'host', 'crud/read', 'x', '--flags', 'feedback', 'y'], fbh, STANDING).args, ['crud/read', 'x', '--flags', 'feedback', 'y'], 'written after the last command\'s URI: that command\'s, passed on as written')
})

test('a command sent on: the flags in force written into its line, those that hold down a chain', (t) => {
  const haicc = { haicc: { default: 'goto', actions: { goto: { command: true } } } }
  const held = { ...NONE, log: 'debug', physical: true, help: true }
  t.alike(carrying(['crud/read', 'x', 'y'], held), ['crud/read', 'x', '--flags', 'log=debug', 'physical', '--', 'y'], 'a list of its own after its URI, closed; a rewrite, the last command\'s, not taken')
  t.alike(carrying(['crud/read'], held), ['crud/read', '--flags', 'log=debug', 'physical', '--'], 'no URI written: after its first word')
  t.alike(carrying(['crud/read', 'x', '--flags', 'log=verbose', 'feedback', 'too', 'slow'], held), ['crud/read', 'x', '--flags', 'log=debug', 'physical', 'log=verbose', 'feedback', 'too', 'slow'], 'its own list: at its head, what it writes itself after')
  t.alike(read(carrying(['crud/read', 'x', '--flags', 'log=verbose'], held), {}, STANDING).flags, { log: 'verbose', physical: true }, 'and what it writes itself holds')
  t.alike(carrying(['haicc', 'host', 'crud/read', 'x', '--flags', 'help'], held, haicc), ['haicc', 'host', '--flags', 'log=debug', 'physical', '--', 'crud/read', 'x', '--flags', 'help'], 'a command that passes on: its own step\'s list, the next command\'s left as written')
  t.alike(carrying(['crud/read', 'x'], NONE), ['crud/read', 'x'], 'none in force: as it was')
})

test('the log: three levels of detail, info without asking; an error and a warning always', (t) => {
  t.alike(LEVELS, ['error', 'warn', 'info', 'verbose', 'debug'])
  const all = l => { for (const level of LEVELS) l.log(level, level, 'Said.'); return l.entries.map(e => e.level) }
  t.alike(all(logger()), ['error', 'warn', 'info'], 'info: what a request gets unasked')
  t.alike(all(logger('verbose')), ['error', 'warn', 'info', 'verbose'])
  t.alike(all(logger('debug')), ['error', 'warn', 'info', 'verbose', 'debug'])
  t.alike(all(logger('silent')), ['error', 'warn', 'info'], 'no level keeps nothing: not one of the three is info')
  t.alike(all(logger('error')), ['error', 'warn', 'info'], 'nor is error a threshold')
  const l = logger('info', () => '2026-11-26T10:00:00.000Z')
  l.log('verbose', 'dropped', 'Not kept.')
  t.is(l.level(), 'info')
  t.is(l.level('debug'), 'debug', 'the detail set from here on')
  l.log('debug', 'kept', 'Read in 3 ms.')
  t.is(l.level('nope'), 'debug', 'not a level: as it was')
  t.alike(l.entries, [{ time: '2026-11-26T10:00:00.000Z', level: 'debug', event: 'kept', line: 'Read in 3 ms.' }], 'an entry: when, its level, its event, what happened: a line')
  t.exception(() => l.log('info', 'x', { ms: 3 }), /not a log entry: x \(what happened, said: a line\)/, 'data is no line')
  t.exception(() => l.log('trace', 'x', 'y'), /not a log level: trace \(error, warn, info, verbose, debug\)/)
})

test('a record: the transport envelope around what it carries; a continuation', (t) => {
  const request = { command: 'rest/get .' }
  const rec = record('/host/inbox', request, 1795312345678)
  t.alike(Object.keys(rec), ['topic', 'key', 'offset', 'timestamp', 'headers', 'value'], 'as its type has it, and its value')
  t.alike([rec.topic, rec.key, rec.offset, rec.headers, rec.value], ['/host/inbox', null, 1795312345678, {}, request], 'the offset: a number, the milliseconds when it arrived; one level, the request inside')
  t.is(new Date(rec.timestamp).toISOString(), rec.timestamp, 'when it was made: a time as JSON holds one')
  t.is(record('/x', 1).offset, null, 'not arrived yet: none')
  t.is(record('/host/request/pending/default', request, 1795400000000, '1795312345678').key, '1795312345678', 'from elsewhere: its own offset here, the other\'s its key')
  t.ok(tick() < tick(), 'a clock in one process: never two the same')
  // a continuation: beside an output, a script for who asked to go on with
  const script = continuationOf('haicc "$HAICC_AT" service/initialise\n', 'host')
  t.alike(script, { at: 'host', script: 'haicc "$HAICC_AT" service/initialise\n' }, 'a continuation: the position it is run for, its script, shell text')
  t.is(continuationOf('true\n').at, '.', 'run for the mrepo itself, when no position is said')
  t.exception(() => continuationOf('x'.repeat(CEILING + 1)), /not a continuation: 65537 bytes \(at most 65536\)/, 'at most CEILING bytes')
  t.exception(() => continuationOf('  \n'), /its script, shell text/, 'an empty script: none')
  t.exception(() => continuationOf([['service/start']]), /its script, shell text/, 'a list of commands: the form of before, refused')
  t.alike(sorted({ continuation: 'start' }).ignored.map(i => i.why), ['no flag: continuation (container, feedback, help, layer, log, physical)'], 'no flag asks for a script: a deploy goes on with its commission hook')
})

test('check: an internal request, the mrepo\'s own: not asked whether active; an action that names its states still by them', (t) => {
  const extract = { protocol: 'help', action: 'extract', uri: ['.'] }
  t.is(check(extract, at('initialised'), { internal: true }), null, 'an action its config does not even name: allowed, the mrepo\'s own')
  t.is(check(req('rest', 'get', 'runtime/service.json'), at('booted'), { internal: true }), null, 'a protocol that is not active, a URI outside main: allowed')
  t.is(check(extract, { service: null, protocols: null }, { internal: true }), null, 'without service too')
  t.ok(/not canonical/.test(check({ ...extract, uri: ['A'] }, at('started'), { internal: true })), 'its URI still checked')
  t.is(check(extract, at('initialised')), 'no action: help extract (get)', 'not internal: asked')
  t.is(check(req('service', 'initialise', '.'), at('initialised'), { internal: true }), 'not now: service initialise (the service is initialised)', 'a service action: its states, internal or not')
  t.is(check(req('service', 'start', '.'), at('initialised'), { internal: true }), null, 'and allowed when its state allows')
})
