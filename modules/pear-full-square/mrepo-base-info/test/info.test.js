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
import { parse, check, extract, keyword, packageKeyword } from '../internal/info/index.js'
import { extractAction } from '../external/extract/index.js'
import { get } from '../external/get/index.js'

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

test('keywords: a word, a section\'s title, an included package by its name without the prefix', (t) => {
  t.alike(['A structure unit', '`package.json`', 'Signature'].map(keyword), ['a-structure-unit', 'package-json', 'signature'])
  t.alike(['haiccing/base-package-boot', 'haiccing/package-docs-mrepo', 'haiccing/base-component-haicc', 'org/solo'].map(packageKeyword), ['boot', 'mrepo', 'haicc', 'solo'])
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
    '/mrepo/packages/layer.json': B(JSON.stringify({ packages: ['org/base-package-x', 'org/package-docs-mrepo', 'org/base-component-y'] })),
    '/modules/third-party.json': B(JSON.stringify({ modules: [{ name: 'brittle', version: '3.0.0', license: 'Apache-2.0' }] }))
  }
})
const mrepo = (top = component()) => [protocol, docs, top]

test('extract: the keywords from the top down; a jump, a category, sections; a module once', (t) => {
  const out = extract(mrepo())
  const index = J(out['/index.json'])
  t.alike(index['.'][0].below, ['mrepo', 'x', 'modules', 'third-party', 'schemas'], 'the top: its menu (a link to nothing not among it), its included packages, the three made here; mrepo once')
  t.is(index['.'][0].page, 'packages/org/base-component-y/README.md', 'the top page: the mrepo\'s own package\'s README')
  t.alike(index.mrepo.map(c => c.page), ['packages/org/base-component-y/mrepo/README.md', 'packages/org/package-docs-mrepo/README.md'], 'mrepo: two choices, its own folder and the documentation package')
  t.alike(index.x[0].below, ['x/run', 'x/howto', 'x/test', 'x/modules', 'x/config'], 'a protocol package: its menu, then its sections')
  t.is(index['x/run'][0].page, 'modules/org/mod-base-x/external/run/README.md', 'a jump: the action, in its module, under the protocol')
  t.alike(index['x/run'][0].below, ['x/run/signature'], 'its sections below it')
  t.alike(index['x/howto/everyday'][0].below, ['x/howto/everyday/start'], 'a category: a page whose menu groups how-tos')
  t.alike(index['x/modules/mod-base-x'][0].see, 'modules/mod-base-x', 'a package\'s module: pointing to its one place')
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
  const [index, missing] = (o => [J(o['/index.json']), J(o['/problems.json'])])(extract(mrepo(none)))
  t.ok(missing.some(p => p.check === 'included' && p.detail.startsWith('no ## Included packages')) && index.x, 'no included packages: said, and taken from its list')
})

test('extract: a package documented beyond the list, at its keyword below the top; the mrepo\'s own still the last of its list', (t) => {
  const z = { pkg: 'org/base-package-z', documented: true, files: { '/README.md': B(page('base-package-z', 'The z protocol.', [['test', 'test/']])), '/test/README.md': B(page('test/', 'Its tests.')), '/lost/README.md': B(page('lost', 'No menu leads here.')) } }
  const out = extract([...mrepo(), z])
  const index = J(out['/index.json'])
  t.is(index['.'][0].page, 'packages/org/base-component-y/README.md', 'the top: the list\'s last, not the documented')
  t.alike(index['.'][0].below, ['mrepo', 'x', 'z', 'modules', 'third-party', 'schemas'], 'the documented below the top, after the included')
  t.is(index['z/test'][0].page, 'packages/org/base-package-z/test/README.md', 'walked as an included package is')
  t.ok(J(out['/problems.json']).some(p => p.page === 'packages/org/base-package-z/lost'), 'its pages checked: one no menu leads to, said')
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
      log () {},
      step: async (event, data, fn) => fn(),
      put: (p, bytes) => { writes.push(p); files[p] = Buffer.from(bytes) },
      remove: p => { writes.push(p); delete files[p] }
    }
    await t.exception(get(exec, {}), /no info extracted in this mrepo yet/, 'get before extract: said')
    const r = await extractAction(exec, { uri: ['.'] })
    t.alike([r.changed, r.problems], [true, 2], 'extracted: its two problems counted')
    t.ok(files['/info/layer.json'] && files['/info/index.json'], 'the layer written, its config when it had none')
    const n = writes.length
    t.alike([(await extractAction(exec, { uri: ['.'] })).changed, writes.length], [false, n], 'again: nothing changed, nothing written')
    await t.exception(extractAction(exec, { uri: ['main', 'x'] }), /info extract: the whole mrepo only/)
    const top = await get(exec, {})
    t.alike([top.keyword, top.choices[0].title, top.choices[0].below.map(b => b.keyword)], ['.', 'base-component-y', ['mrepo', 'x', 'modules', 'third-party', 'schemas']], 'nothing asked: the top page and its keywords')
    t.absent(top.choices[0].page.includes('## Links'), 'the page without its menus: they are its keywords')
    const run = await get(exec, { args: ['x/run'] })
    t.alike([run.choices[0].title, run.choices[0].oneliner, run.choices[0].below], ['run', 'Runs x.', [{ keyword: 'x/run/signature', oneliner: '`run(exec, form)`.', choices: 1 }]], 'an action: its page, its sections below')
    t.alike((await get(exec, { args: ['x', 'run', 'signature'] })).choices[0], { title: 'Signature', oneliner: '`run(exec, form)`.', page: '`run(exec, form)`.', below: [], packages: [] }, 'a section, the keywords as words')
    t.is((await get(exec, { args: ['mrepo'] })).choices.length, 2, 'a keyword with two meanings: both choices')
    t.alike((await get(exec, { args: ['x'] })).choices[0].packages, ['org/base-package-x'], 'each choice: the package it is from')
    await t.exception(get(exec, { args: ['x/nothing'] }), /no x\/nothing here: nearest x, below it run, howto, test, modules, config/, 'a keyword that is not there: the nearest, and what is below it')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('get: the same page in several packages one choice, its packages all named; pages that differ apart', async (t) => {
  const generic = '# test-reports/\n\nThe proof.\n'
  const files = {
    '/info/index.json': B(JSON.stringify({ 'z/test-reports': [{ page: 'packages/org/a/test-reports/README.md', oneliner: 'The proof.', below: [] }, { page: 'packages/org/b/test-reports/README.md', oneliner: 'The proof.', below: [] }, { page: 'packages/org/c/test-reports/README.md', oneliner: 'Its own.', below: [] }] })),
    '/info/packages/org/a/test-reports/README.md': B(generic),
    '/info/packages/org/b/test-reports/README.md': B(generic),
    '/info/packages/org/c/test-reports/README.md': B('# test-reports/\n\nIts own.\n')
  }
  const exec = { read: async p => { if (!(p in files)) throw new Error(`nothing at ${p}`); return files[p] }, find: async p => files[p] ?? null, log () {} }
  const r = await get(exec, { args: ['z', 'test-reports'] })
  t.alike(r.choices.map(c => [c.oneliner, c.packages]), [['The proof.', ['org/a', 'org/b']], ['Its own.', ['org/c']]], 'the same page once, both packages named; the one that differs apart')
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
  for (const k of ['mrepo', 'test', 'test/info', 'test-reports', 'name', 'example', 'example/hello', 'example/hello/notes/mrepo', 'readmes', 'a-new-package', 'modules', 'third-party', 'schemas']) t.ok(index[k], `${k}`)
  const own = J(out['/problems.json']).filter(p => (p.page ?? '').startsWith('packages/'))
  for (const p of own) t.comment(`${p.page}: ${p.check}: ${p.detail}`)
  t.is(own.length, 0, 'its own pages: no problem (the modules it carries are theirs)')
})
