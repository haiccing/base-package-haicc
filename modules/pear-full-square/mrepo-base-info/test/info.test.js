// The info layer: a README read (its menus), the rules on it, an mrepo's
// pages addressed by keywords from its packages, and the two actions on an
// execution written for them; the template's own bundle extracted when a
// sources folder is there (SOURCES, as a package's tests pass theirs).
import test from 'brittle'
import os from 'bare-os'
import Bundle from 'bare-bundle'
import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { fileURLToPath } from 'bare-url'
import { parse, check, extract, keyword, packageKeyword, packageKey, withSteps, WANTED } from '../internal/info/index.js'
import { extractAction } from '../external/extract/index.js'
import { get, PAGE } from '../external/get/index.js'
import { clear } from '../external/clear/index.js'

const B = s => Buffer.from(s)
const J = b => JSON.parse(b.toString())
const page = (title, line, menu = [], rest = '') => `# ${title}\n\n${line}\n${menu.length ? `\n## Links\n\n${menu.map(([l, t]) => `- [${l}](${t})`).join('\n')}\n` : ''}${rest}`

test('a README read: its menu, its included packages, its sections; the old form', (t) => {
  const r = parse(page('thing', 'A thing, with `package.json` inside. More.', [['sub', 'sub/']], '\n## Included packages\n\n- [base-package-boot](../base-package-boot/)\n\n## Usage\n\nUse it.\n'))
  t.is(r.oneliner, 'A thing, with `package.json` inside.', 'the first sentence, a full stop in code ignored')
  t.alike(r.menu, [{ label: 'sub', target: 'sub/' }], 'the menu: a label, a target')
  t.alike(r.included, [{ label: 'base-package-boot', target: '../base-package-boot/' }], 'the included packages: siblings')
  t.alike(r.sections.map(s => s.title), ['Usage'], 'the sections: the menus not among them')
  const old = parse('# old\n\nThe old form.\n\n| | |\n|---|---|\n| [sub/](sub/) | below |\n\n```\n[not](code/)\n```\n')
  t.alike([old.menu, old.table], [null, [{ label: 'sub/', target: 'sub/' }]], 'no menu: the links of its text, not those in code')
})

test('the rules: the README rules, and the menu\'s form', (t) => {
  t.alike(check(page('ok', 'Fine.', [['sub', 'sub/']])), [], 'a menu, first')
  t.alike(check('# old\n\nThe old form.\n\n| [sub/](sub/) | below |\n'), [['menu', 'links, not a menu (## Links)']], 'links without a menu: the old form')
  t.alike(check('# late\n\nLate.\n\n## Usage\n\nU.\n\n## Links\n\n- [sub](sub/)\n'), [['menu', '## Links is not its first section']])
  t.alike(check('# none\n\n'), [['oneliner', 'none']])
  const dev = ['dev', 'env', '3', 'y'].join('-') // (written so, or this file's own check would find it)
  t.alike(check(`# linked\n\nLinked.\n\nWritten from [x/${dev}](https://github.com/x/${dev}).\n`), [['transient', dev]], 'a link to where it was made: transient')
  const words = ['Development', 'repository'].join(' ') // (written so, or this file's own check would find it)
  t.alike(check(`# said\n\nSaid.\n\nBuilt in the ${words}.\n`), [['transient', words]], 'a mention of where it was made, in words: transient')
})

test('keywords: a word, a section\'s title, a package by its name without the prefix; in full form, its name fully qualified', (t) => {
  t.alike(['A structure unit', '`package.json`', 'Signature'].map(keyword), ['a-structure-unit', 'package-json', 'signature'])
  t.alike(['haiccing/base-package-boot', 'haiccing/package-docs-mrepo', 'haiccing/base-component-haicc', 'org/solo'].map(packageKeyword), ['boot', 'mrepo', 'haicc', 'solo'])
  t.alike(['haiccing/base-package-boot', 'splectral/base-component-help-viewer'].map(packageKey), ['haiccing/base-package-boot', 'splectral/base-component-help-viewer'], 'in full form: its name fully qualified, as a package is always named')
})

// An mrepo of three packages: a protocol package whose menu jumps to its
// module's action, with a category of how-tos; a documentation package; a
// component, the mrepo's own, last, which includes both.
const MOD = '/modules/org/mod-base-x'
const protocol = {
  pkg: 'org/base-package-x',
  files: {
    '/README.md': B(page('base-package-x', 'The x protocol.', [['run', `modules/org/mod-base-x/external/run/`], ['howto', 'howto/'], ['test', 'test/'], ['modules', 'modules/']], '\n## Config\n\nNone.\n')),
    '/howto/README.md': B(page('howto/', 'Its how-tos.', [['everyday', 'everyday/']])),
    '/howto/everyday/README.md': B(page('everyday', 'What is done every day.', [['start', '../start/']])),
    '/howto/start/README.md': B(page('start', 'Starts it.')),
    '/test/README.md': B(page('test/', 'Its tests.')),
    '/modules/README.md': B(page('modules/', 'Its code.', [['mod-base-x', 'org/mod-base-x/']])),
    [`${MOD}/README.md`]: B(page('mod-base-x', 'The x module.', [['external', 'external/']])),
    [`${MOD}/external/README.md`]: B(page('external/', 'Its actions.', [['run', 'run/']])),
    [`${MOD}/external/run/README.md`]: B(page('run', 'Runs x.', [], '\n## Signature\n\n`run(exec, form)`.\n')),
    '/modules/third-party.json': B(JSON.stringify({ modules: [{ name: 'brittle', version: '3.0.0', license: 'Apache-2.0' }] })),
    '/schemas/answer.json': B(JSON.stringify({ type: 'record', name: 'org.basePackageX.answer', fields: [{ name: 'said', type: 'string' }] })),
    [`${MOD}/schemas/thing.json`]: B(JSON.stringify({ type: 'record', name: 'org.modBaseX.thing', fields: [{ name: 'n', type: 'long' }, { name: 'j', type: 'pearFullSquare.myceliumValueAvro.json' }] }))
  }
}
const docs = { pkg: 'org/package-docs-mrepo', files: { '/README.md': B(page('package-docs-mrepo', 'The mrepo, documented.')), '/lost/README.md': B(page('lost', 'No menu leads here.')) } }
const component = (included = '- [base-package-x](../base-package-x/)\n- [package-docs-mrepo](../package-docs-mrepo/)') => ({
  pkg: 'org/base-component-y',
  files: {
    '/README.md': B(page('base-component-y', 'The y component.', [['mrepo', 'mrepo/'], ['gone', 'gone/']], `\n## Included packages\n\n${included}\n`)),
    '/mrepo/README.md': B(page('mrepo/', 'Its list.')),
    '/mrepo/packages/.layer.json': B(JSON.stringify({ packages: ['org/base-package-x', 'org/package-docs-mrepo', 'org/base-component-y'] })),
    '/modules/third-party.json': B(JSON.stringify({ modules: [{ name: 'brittle', version: '3.0.0', license: 'Apache-2.0' }] }))
  }
})
const mrepo = (top = component()) => [protocol, docs, top]

// A package's own index, by its short keywords, in an extraction's files.
const idx = (out, pkg) => J(out[`/packages/${pkg}/index.json`])

test('extract: the keywords from the top down, split on package; a jump, a category, sections; a module once', (t) => {
  const out = extract(mrepo())
  const index = J(out['/index.json'])
  const [y, x, d] = ['org/base-component-y', 'org/base-package-x', 'org/package-docs-mrepo'].map(p => idx(out, p))
  t.alike(index['.'][0].below, ['org', 'modules', 'third-party', 'schemas'], 'the top: its organisations, the three made here')
  t.is(index['.'][0].page, 'packages/org/base-component-y/README.md', 'the top page: the mrepo\'s own package\'s README')
  t.alike(index.org[0].below, ['org/base-component-y', 'org/base-package-x', 'org/package-docs-mrepo'], 'an organisation: its packages in full form, the mrepo\'s own first, then its included ones')
  t.ok(index.org[0].generated && out['/packages/org/README.md'].toString().includes('- [base-package-x](base-package-x/)'), 'its page made here')
  t.absent(Object.keys(index).some(k => k.startsWith('org/')), 'no package\'s keyword in the mrepo\'s index: each in its own')
  t.alike(J(out['/packages.json']), { 'org/base-component-y': { oneliner: 'The y component.', own: true }, 'org/base-package-x': { oneliner: 'The x protocol.' }, 'org/package-docs-mrepo': { oneliner: 'The mrepo, documented.' } }, 'the packages, the contexts: the mrepo\'s own marked')
  t.alike(y['.'][0].below, ['mrepo'], 'a package\'s index: its README at ., its menu below it (a link to nothing not among it)')
  t.alike([y.mrepo[0].page, d['.'][0].page], ['packages/org/base-component-y/mrepo/README.md', 'packages/org/package-docs-mrepo/README.md'], 'mrepo: its own folder in its package, the documentation package in its own: apart')
  t.alike(x['.'][0].below, ['run', 'howto', 'test', 'modules', 'config'], 'a protocol package: its menu, then its sections, by short keywords')
  t.is(x.run[0].page, 'modules/org/mod-base-x/external/run/README.md', 'a jump: the action, in its module, under the protocol')
  t.alike(x.run[0].below, ['run/signature'], 'its sections below it')
  t.alike(x['howto/everyday'][0].below, ['howto/everyday/start'], 'a category: a page whose menu groups how-tos')
  t.alike(x['modules/mod-base-x'][0].see, 'modules/mod-base-x', 'a package\'s module: pointing to its one place')
  t.alike(J(out['/keywords.json']).mrepo, ['org/base-component-y'], 'keywords.json: a short keyword, the packages that have it')
  t.ok(index['modules/mod-base-x/external/run'], 'the module once, under modules, whole')
  t.ok(out['/modules/org/mod-base-x/external/run/README.md'] && !Object.keys(out).some(p => p.startsWith('/packages/org/base-package-x/modules/org')), 'its pages written once, at the module\'s place')
  t.ok(out['/modules/README.md'].toString().includes('- [mod-base-x](mod-base-x/)'), 'modules: a page made here')
  t.ok(out['/third-party/README.md'].toString().includes('| [brittle]() | 3.0.0 | Apache-2.0 | 2 packages |'), 'third-party: a page made here, each module once')
  const schemas = out['/schemas/README.md'].toString()
  t.ok(/\| `org\/base-package-x\/answer` \| `[0-9a-f]{16}` \| `said` \| 1 packages \|/.test(schemas) && schemas.includes('| `org/mod-base-x/thing` |'), 'schemas: a page made here, each once by its URI, its fingerprint, its fields: the package\'s own, its modules\'')
  t.ok(index.modules[0].generated && index['third-party'][0].generated && index.schemas[0].generated, 'all marked as made here')
})

test('extract: what does not fit is a problem, never resolved silently', (t) => {
  const problems = J(extract(mrepo())['/problems.json'])
  t.alike(problems.map(p => [p.check, p.detail]), [['links', 'gone/: nothing there'], ['reached', 'no menu leads to it']], 'a link to nothing; a README no menu leads to')
  t.is(problems[1].page, 'packages/org/package-docs-mrepo/lost')
  const order = J(extract(mrepo(component('- [package-docs-mrepo](../package-docs-mrepo/)\n- [base-package-x](../base-package-x/)')))['/problems.json'])
  t.ok(order.some(p => p.check === 'included' && p.detail.startsWith('not its list, in deploy order')), 'included packages not in its list\'s order')
  const none = component()
  none.files['/README.md'] = B(page('base-component-y', 'The y component.', [['mrepo', 'mrepo/']]))
  const o2 = extract(mrepo(none))
  const missing = J(o2['/problems.json'])
  t.ok(missing.some(p => p.check === 'included' && p.detail.startsWith('no ## Included packages')) && J(o2['/packages.json'])['org/base-package-x'], 'no included packages: said, and taken from its list')
})

test('extract: a package documented beyond the list, below its organisation; the mrepo\'s own still the last of its list', (t) => {
  const z = { pkg: 'org/base-package-z', documented: true, files: { '/README.md': B(page('base-package-z', 'The z protocol.', [['test', 'test/']])), '/test/README.md': B(page('test/', 'Its tests.')), '/lost/README.md': B(page('lost', 'No menu leads here.')) } }
  const out = extract([...mrepo(), z])
  const index = J(out['/index.json'])
  t.is(index['.'][0].page, 'packages/org/base-component-y/README.md', 'the top: the list\'s last, not the documented')
  t.alike(index.org[0].below, ['org/base-component-y', 'org/base-package-x', 'org/package-docs-mrepo', 'org/base-package-z'], 'the documented below its organisation, after the included')
  t.is(idx(out, 'org/base-package-z').test[0].page, 'packages/org/base-package-z/test/README.md', 'walked as an included package is, in its own index')
  t.ok(J(out['/packages.json'])['org/base-package-z'].documented, 'marked documented')
  t.ok(J(out['/problems.json']).some(p => p.page === 'packages/org/base-package-z/lost'), 'its pages checked: one no menu leads to, said')
})

test('a how-to\'s page with its steps: its ## Steps filled from the script beside it, a fact once', (t) => {
  const script = '# step: one\n. crud/read .\n# expect: "uri"\n'
  t.is(withSteps('# a\n\nDoes.\n\n## Steps\n\nIn the script.\n\n## Notes\n\n- n\n', script), '# a\n\nDoes.\n\n## Steps\n\n```haicc\n# step: one\n. crud/read .\n# expect: "uri"\n```\n\n## Notes\n\n- n\n', 'its section\'s text replaced by the script')
  t.is(withSteps('# a\n\nDoes.\n\n## Notes\n\n- n\n', script), '# a\n\nDoes.\n\n## Steps\n\n```haicc\n# step: one\n. crud/read .\n# expect: "uri"\n```\n\n## Notes\n\n- n\n', 'none: made before the notes')
  t.is(withSteps('# a\n\nDoes.\n', script), '# a\n\nDoes.\n\n## Steps\n\n```haicc\n# step: one\n. crud/read .\n# expect: "uri"\n```\n', 'nor notes: last')
  t.ok(WANTED('/howto/x/steps.haicc') && !WANTED('/steps.haicc') && !WANTED('/howto/x/other.haicc'), 'what extraction reads: a how-to\'s script')
  const files = { '/package.json': Buffer.from('{}'), '/README.md': Buffer.from('# p\n\nA package.\n\n## Links\n\n- [howto](howto/)\n'), '/howto/README.md': Buffer.from('# howto/\n\nIts how-tos.\n\n## Links\n\n- [x](x/)\n'), '/howto/x/README.md': Buffer.from('# x\n\nDoes x.\n\n## Steps\n\nThe script.\n'), '/howto/x/steps.haicc': Buffer.from(script) }
  const out = extract([{ pkg: 'haiccing/p', files, paths: Object.keys(files) }], { alone: true })
  t.ok(out['/packages/haiccing/p/howto/x/README.md'].toString().includes('```haicc\n# step: one'), 'extracted: the page in the layer holds its script')
  t.alike(JSON.parse(out['/problems.json'].toString()), [], 'no problem')
})

test('the actions: extract writes the layer, get reads it by keywords', async (t) => {
  const dir = mkdtempSync(join(os.tmpdir(), 'info-'))
  try {
    for (const p of mrepo()) {
      const b = new Bundle()
      for (const [k, v] of Object.entries(p.files)) b.write(k, v)
      mkdirSync(join(dir, 'packages', 'org'), { recursive: true })
      writeFileSync(join(dir, 'packages', `${p.pkg}.bundle`), b.toBuffer())
    }
    const files = { '/packages/manifest.json': B(JSON.stringify({ packages: { 'org/base-package-x': {}, 'org/package-docs-mrepo': {}, 'org/base-component-y': {} } })) }
    const writes = []
    const exec = {
      runtime: { dir },
      read: async p => { if (!(p in files)) throw new Error(`nothing at ${p}`); return files[p] },
      find: async function (p) { try { return await this.read(p) } catch { return null } },
      log (level, event, line) { if (typeof line !== 'string') throw new Error(`not a log entry: ${event}`) },
      step: async (event, line, fn) => fn(),
      put: (p, bytes) => { writes.push(p); files[p] = Buffer.from(bytes) },
      remove: p => { writes.push(p); delete files[p] }
    }
    await t.exception(get(exec, {}), /no info extracted in this mrepo yet/, 'get before extract: said')
    const r = await extractAction(exec, { uri: ['.'] })
    t.ok(/^Extracted the info of 3 packages: \d+ keywords, \d+ pages\.\nThe info layer changed: \d+ put, 0 removed\.\n2 problems in its pages: info\/problems\.json\.$/.test(r), `extracted, said: what changed, its two problems counted: ${r}`)
    t.ok(files['/info/.layer.json'] && files['/info/index.json'], 'the layer written, its config when it had none')
    const n = writes.length
    t.alike([(await extractAction(exec, { uri: ['.'] })).split('\n')[1], writes.length], ['Nothing changed: the info layer as it was.', n], 'again: nothing changed, nothing written')
    await t.exception(extractAction(exec, { uri: ['main', 'x'] }), /info extract: the whole mrepo only/)
    // get: the page asked for, said as it is written; the keywords below it, each as it is asked
    const below = r => r.message.split('\n').filter(l => l.startsWith('- '))
    const first = r => r.message.split('\n')[0]
    const top = await get(exec, {})
    t.is(first(top), '.: The y component.', 'nothing asked: the top page, its keyword and what it is first')
    t.alike(below(top).map(l => l.slice(2).split(':')[0]), ['org', 'modules', 'third-party', 'schemas'], 'its keywords below it, a line each: its organisations, the three made here')
    t.absent(top.message.includes('## Links'), 'the page without its menus: they are its keywords')
    t.alike(top.attachments, [{ name: 'base-component-y', type: PAGE, at: 'info/packages/org/base-component-y/README.md' }], 'the page itself attached: its type, where it is')
    const run = await get(exec, { args: ['org/base-package-x/run'] })
    t.alike([first(run), below(run)], ['org/base-package-x/run: Runs x.', ['- org/base-package-x/run/signature: `run(exec, form)`.']], 'in a package\'s context, its name in front: an action, its sections below it, each written as it is asked')
    const sig = await get(exec, { args: ['org', 'base-package-x', 'run', 'signature'] })
    t.alike([sig.message, sig.attachments[0].name], ['org/base-package-x/run/signature: `run(exec, form)`.\n\n`run(exec, form)`.', 'Signature'], 'a section, the keywords as words: its text')
    t.is(first(await get(exec, { args: ['base-package-x/run'] })), 'org/base-package-x/run: Runs x.', 'its name alone, the only one of that name here: the same context')
    t.alike(below(await get(exec, { args: ['org'] })), ['- org/base-component-y: The y component.', '- org/base-package-x: The x protocol.', '- org/package-docs-mrepo: The mrepo, documented.'], 'an organisation: its packages, the contexts')
    t.is(first(await get(exec, { args: ['mrepo'] })), 'org/base-component-y/mrepo: Its list.', 'a short keyword: the mrepo\'s own package\'s first, written in its context')
    t.is(first(await get(exec, { args: ['run'] })), 'org/base-package-x/run: Runs x.', 'a short keyword not its own: the one package that has it, in its context')
    await t.exception(get(exec, { args: ['org/base-package-x/nothing'] }), /no org\/base-package-x\/nothing here: nearest org\/base-package-x, below it run, howto, test, modules, config/, 'a keyword not there in a context: the nearest there, and what is below it')
    await t.exception(get(exec, { args: ['nothing'] }), /no nothing here: nearest \., below it org, modules, third-party, schemas/, 'not there at all: the top, and what is below it')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('documents: store: every other package in the store documented, below its organisation; extract again adds what is new; clear removes the build', async (t) => {
  const dir = mkdtempSync(join(os.tmpdir(), 'info-store-'))
  const store = mkdtempSync(join(os.tmpdir(), 'info-store-packages-'))
  const bundle = (at, p) => { const b = new Bundle(); for (const [k, v] of Object.entries(p.files)) b.write(k, v); mkdirSync(dirname(join(at, `${p.pkg}.bundle`)), { recursive: true }); writeFileSync(join(at, `${p.pkg}.bundle`), b.toBuffer()) }
  try {
    for (const p of mrepo()) bundle(join(dir, 'packages'), p)
    const other = { pkg: 'else/base-package-w', files: { '/README.md': B(page('base-package-w', 'The w protocol.', [['run', 'run/']])), '/run/README.md': B(page('run', 'Runs w.')) } }
    bundle(store, other)
    mkdirSync(join(store, 'addons'), { recursive: true })
    const files = {
      '/packages/manifest.json': B(JSON.stringify({ store, packages: { 'org/base-package-x': {}, 'org/package-docs-mrepo': {}, 'org/base-component-y': {} } })),
      '/packages/.layer.json': B(JSON.stringify({ packages: ['org/base-package-x', 'org/package-docs-mrepo', 'org/base-component-y'], documents: 'store' }))
    }
    const exec = {
      runtime: { dir },
      read: async p => { if (!(p in files)) throw new Error(`nothing at ${p}`); return files[p] },
      find: async function (p) { try { return await this.read(p) } catch { return null } },
      log (level, event, line) { if (typeof line !== 'string') throw new Error(`not a log entry: ${event}`) },
      step: async (event, line, fn) => fn(),
      put: (p, bytes) => { files[p] = Buffer.from(bytes) },
      remove: p => { delete files[p] }
    }
    await extractAction(exec, { uri: ['.'] })
    t.alike(J(files['/info/packages.json'])['else/base-package-w'], { oneliner: 'The w protocol.', documented: true }, 'a package in the store, not in the list: documented, a context of its own')
    t.alike((await get(exec, { args: ['else'] })).message.split('\n').filter(l => l.startsWith('- ')), ['- else/base-package-w: The w protocol.'], 'below its organisation')
    t.alike((await get(exec, { args: ['run'] })).message.split('\n').filter(l => l.startsWith('== ')), ['== org/base-package-x/run (org/base-package-x): Runs x.', '== else/base-package-w/run (else/base-package-w): Runs w.'], 'a short keyword in two packages: a choice each, apart')
    const added = { pkg: 'else/base-package-v', files: { '/README.md': B(page('base-package-v', 'The v protocol.')) } }
    bundle(store, added)
    t.ok(/^The info layer changed/.test((await extractAction(exec, { uri: ['.'] })).split('\n')[1]), 'extract again: what is new in the store added')
    t.ok(J(files['/info/packages.json'])['else/base-package-v'], 'there')
    t.is((await extractAction(exec, { uri: ['.'] })).split('\n')[1], 'Nothing changed: the info layer as it was.', 'and again: nothing new, nothing changed')
    t.ok(/^Cleared the info layer's build: \d+ files removed\.$/.test(await clear(exec, { uri: ['.'] })), 'clear: the build removed, said')
    t.alike(Object.keys(files).filter(p => p.startsWith('/info/') && p !== '/info/.layer.json'), [], 'nothing of it left, the layer\'s config kept')
    t.is(await clear(exec, { uri: ['.'] }), 'Nothing built in the info layer: nothing removed.', 'clear again: nothing built, a repeat')
    await t.exception(clear(exec, { uri: ['main', 'x'] }), /info clear: the whole mrepo only/)
    files['/packages/manifest.json'] = B(JSON.stringify({ packages: {} }))
    await t.exception(extractAction(exec, { uri: ['.'] }), /documents: store: the packages manifest names no store/, 'documents the store, names none: said')
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true }) }
})

test('get: a short keyword several packages have: a choice each, kept apart, each written in its context', async (t) => {
  const generic = '# test-reports/\n\nThe proof.\n'
  const files = {
    '/info/index.json': B(JSON.stringify({ '.': [{ page: 'packages/org/a/README.md', oneliner: 'A.', below: ['org'] }] })),
    '/info/packages.json': B(JSON.stringify({ 'org/a': { oneliner: 'A.', own: true }, 'org/b': { oneliner: 'B.' }, 'org/c': { oneliner: 'C.' } })),
    '/info/keywords.json': B(JSON.stringify({ 'test-reports': ['org/b', 'org/c'] })),
    '/info/packages/org/a/index.json': B(JSON.stringify({ '.': [{ page: 'packages/org/a/README.md', oneliner: 'A.', below: [] }] })),
    '/info/packages/org/b/index.json': B(JSON.stringify({ 'test-reports': [{ page: 'packages/org/b/test-reports/README.md', oneliner: 'The proof.', below: [] }] })),
    '/info/packages/org/c/index.json': B(JSON.stringify({ 'test-reports': [{ page: 'packages/org/c/test-reports/README.md', oneliner: 'The proof.', below: [] }] })),
    '/info/packages/org/b/test-reports/README.md': B(generic),
    '/info/packages/org/c/test-reports/README.md': B(generic)
  }
  const exec = { read: async p => { if (!(p in files)) throw new Error(`nothing at ${p}`); return files[p] }, find: async p => files[p] ?? null, log () {} }
  const r = await get(exec, { args: ['test-reports'] })
  t.alike([r.message.split('\n')[0], r.message.split('\n').filter(l => l.startsWith('== ')), r.attachments.map(a => a.at)], ['test-reports: 2 choices, each apart.', ['== org/b/test-reports (org/b): The proof.', '== org/c/test-reports (org/c): The proof.'], ['info/packages/org/b/test-reports/README.md', 'info/packages/org/c/test-reports/README.md']], 'one choice a package, the same page twice: packages are apart; each under the keyword to go on with in its context, its page attached')
})

// the template's bundle, as a runtime reads it
const SOURCES = os.hasEnv('SOURCES') ? os.getEnv('SOURCES') : join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'sources')
const TEMPLATE = join(SOURCES, 'haiccing', 'base-docs-package.bundle')

test('the template, extracted from its bundle: its keywords, nothing against its own rules', { skip: !existsSync(TEMPLATE) }, (t) => {
  const b = Bundle.from(readFileSync(TEMPLATE))
  const files = {}
  for (const k of Object.keys(b.files)) if (k.endsWith('/README.md') || k === '/package.json' || k === '/modules/third-party.json') files[k] = b.read(k)
  const out = extract([{ pkg: 'haiccing/base-docs-package', files, paths: Object.keys(b.files) }])
  const index = J(out['/index.json'])
  const own = idx(out, 'haiccing/base-docs-package')
  for (const k of ['.', 'mrepo', 'test', 'test/info', 'test-reports', 'name', 'example', 'example/hello', 'example/hello/notes/mrepo', 'readmes', 'a-new-package']) t.ok(own[k], `its own: ${k}`)
  for (const k of ['haiccing', 'modules', 'third-party', 'schemas']) t.ok(index[k], `the mrepo's: ${k}`)
  const mine = J(out['/problems.json']).filter(p => (p.page ?? '').startsWith('packages/'))
  for (const p of mine) t.comment(`${p.page}: ${p.check}: ${p.detail}`)
  t.is(mine.length, 0, 'its own pages: no problem (the modules it carries are theirs)')
})
