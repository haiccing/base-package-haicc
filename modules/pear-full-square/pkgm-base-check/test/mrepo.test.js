// The mrepo checks on packages written here: one well formed, one that
// breaks each.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { checkStructure, checkProtocol, checkCarried, leaves, contributions } from '../index.js'

function write (dir, files) { for (const [p, t] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), typeof t === 'string' ? t : JSON.stringify(t)) } }
const KEY = '0000000000001'
const OFFSET = 1
const good = {
  'package.json': { name: 'p', type: 'module', main: 'main.js' },
  'main.js': '',
  'mrepo/README.md': '# mrepo/\n',
  'mrepo/main/.layer.json': { mode: 'atomic', description: 'The data.' },
  'mrepo/runtime/service.json': { state: 'booted' },
  'mrepo/packages/.layer.json': { mode: 'replicated', description: 'The packages.', packages: ['org/p'] },
  'mrepo/request/pending/default/.layer.json': { mode: 'non-atomic', description: 'Waiting.' },
  [`mrepo/request/pending/default/${KEY}.json`]: { topic: '/request/pending/default', offset: OFFSET, value: { topic: null, offset: OFFSET, value: { protocol: 'boot', action: 'deploy', uri: '/host' } } },
  'modules/org/m/external/a/index.js': 'export function a () {}\n',
  'modules/org/m/external/a/README.md': '# a\n\nDoes a.\n\n## Signature\n\n## Arguments\n\n## Returns\n\n## Errors\n',
  'protocol.js': 'import { a } from "./modules/org/m/external/a/index.js"\nexport const protocols = { p: { package: "org/p", description: "P.", actions: { a: { uris: ["/"], args: ["x"], description: "A." } } } }\nexport const actions = { p: { a } }\n',
  'modules/third-party.json': { modules: [{ name: 'x', version: '1.0.0' }], omitted: ['y'] },
  'modules/node_modules/x/package.json': { name: 'x', version: '1.0.0' },
  'modules/node_modules/y/package.json': { name: 'y', version: '0.0.0-omitted' }
}

test('a package well formed: its structure, its protocols, what it carries: none', async (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, good)
    t.alike(leaves(join(d, 'mrepo')), ['main', 'packages', 'request/pending/default'])
    t.alike(contributions(join(d, 'mrepo')), ['runtime/service.json'], 'a file into a layer another package defines')
    t.alike([...checkStructure(d), ...await checkProtocol(d), ...checkCarried(d)], [])
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a package that breaks each', async (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, {
      ...good,
      'package.json': { name: 'p', type: 'module', main: 'gone.js' },
      'mrepo/stray.txt': 'x',
      'mrepo/main/.layer.json': { mode: 'sometimes' },
      'mrepo/main/README.md': '# no\n',
      'mrepo/packages/.layer.json': { mode: 'replicated', description: 'The packages.', packages: ['nameonly'] },
      [`mrepo/request/pending/default/${KEY}.json`]: { topic: '/elsewhere', offset: 2, value: { offset: OFFSET, value: { protocol: 'boot' } } },
      'protocol.js': 'export const protocols = { p: { actions: { a: { description: "A." }, b: { uris: ["/"], description: "B." } } } }\nexport const actions = { p: { a () {}, c () {} } }\n',
      'modules/node_modules/x/package.json': { name: 'x', version: '2.0.0' },
      'modules/node_modules/y/package.json': { name: 'y', version: '1.0.0' },
      'modules/node_modules/z/package.json': { name: 'z', version: '1.0.0' }
    })
    const s = checkStructure(d).map(p => p.detail)
    t.is(s.length, 8, `structure: a stray file, a mode, no description, a README in a layer, the packages list, a preloaded request's topic, offset and form\n${s.join('\n')}`)
    const p = (await checkProtocol(d)).map(p => p.detail).sort()
    t.alike(p, ['p a: no uris', 'p a: the function mounted is not its method\'s (external/a/ in org/m)', 'p b: configured, no function', 'p c: a function, not configured', 'p: no description', 'p: no package'].sort(), 'protocol')
    t.alike(checkCarried(d).map(p => p.detail).sort(), ['package.json: main gone.js not there', 'x: 2.0.0 carried, 1.0.0 recorded', 'y: omitted, yet carried (1.0.0)', 'z: carried, not recorded'].sort(), 'carried')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('an action is a documented method: its folder, the function it exports, what its README states', async (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, {
      ...good,
      'modules/org/m/external/a/README.md': '# a\n\nDoes a.\n\n## Signature\n\n## Returns\n',
      'modules/org/m/internal/b/index.js': 'export function b () {}\n',
      'protocol.js': 'import { a } from "./modules/org/m/external/a/index.js"\nimport { b } from "./modules/org/m/internal/b/index.js"\nexport const protocols = { p: { package: "org/p", description: "P.", actions: { a: { uris: ["/"], args: ["x"], description: "A." }, b: { uris: ["/"], description: "B." } } } }\nexport const actions = { p: { a, b } }\n'
    })
    t.alike((await checkProtocol(d)).map(p => p.detail).sort(), [
      'p a: its README does not state its arguments (org/m, external/a/README.md, "## Arguments")',
      'p a: its README does not state its errors (org/m, external/a/README.md, "## Errors")',
      'p b: not a documented method (external/b/ in a module it carries)'
    ], 'a section missing, said; arguments asked where the config names any; an action mounted from elsewhere')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a list that does not end with its own package', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, { ...good, 'mrepo/packages/.layer.json': { mode: 'replicated', description: 'The packages.', packages: ['org/p', 'org/docs'] } })
    t.alike(checkStructure(d).map(p => p.detail), ['mrepo/packages/.layer.json: its list ends with org/docs, not with the package itself (p)'], 'the last package of a list defines the mrepo: its own')
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('hooks: in their place, on a transition, each a command', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, {
      ...good,
      'mrepo/runtime/hooks/boot.haicc': '# boot\nprotocol/activate . p\n',
      'mrepo/runtime/hooks/initialise.haicc': 'info/extract\n'
    })
    t.alike(checkStructure(d), [], 'well formed: none')
    write(d, {
      'mrepo/runtime/hooks/reboot.haicc': 'a/b\n',
      'mrepo/runtime/hooks/start/x.haicc': 'a/b\n',
      'mrepo/runtime/hooks/stop.json': ['a/b'],
      'mrepo/runtime/hooks/shutdown.haicc': '# nothing\n',
      'mrepo/runtime/hooks/initialise.haicc': 'Not A Command\n'
    })
    t.alike(checkStructure(d).map(p => p.detail).sort(), [
      'mrepo/runtime/hooks/initialise.haicc: not a command: Not A Command (<protocol>/<action> <URI> <arguments>)',
      'mrepo/runtime/hooks/reboot.haicc: no transition reboot (boot, commission, initialise, start, stop, shutdown, decommission)',
      'mrepo/runtime/hooks/shutdown.haicc: no command in it',
      'mrepo/runtime/hooks/start/x.haicc: not a hook\'s place (hooks/<transition>.haicc, a file a transition)',
      'mrepo/runtime/hooks/stop.json: not a hook\'s place (hooks/<transition>.haicc, a file a transition)'
    ])
  } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a layer\'s structure: a structure type there is, with what it needs', (t) => {
  const said = structure => {
    const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
    try {
      write(d, { ...good, 'mrepo/data/sets/.layer.json': { mode: 'non-atomic', description: 'Sets.', ...(structure === undefined ? {} : { structure }) } })
      return checkStructure(d).map(p => p.detail)
    } finally { rmSync(d, { recursive: true, force: true }) }
  }
  t.alike(said(undefined), [], 'none said: a plain tree')
  t.alike(said({ type: 'tree' }), [])
  t.alike(said({ type: 'offset-files', levels: [5, 6], batch: 50 }), [], 'a topic\'s records as files by their offsets')
  t.alike(said({ type: 'parquet' }), ['mrepo/data/sets/.layer.json: structure type parquet (one of tree, offset-files)'], 'a type there is none of')
  t.alike(said({ type: 'offset-files', levels: [6, 5] }), ['mrepo/data/sets/.layer.json: structure levels (how many of an offset\'s 13 digits name each folder, growing: [5, 6])'])
  t.alike(said({ type: 'offset-files' }), ['mrepo/data/sets/.layer.json: structure levels (how many of an offset\'s 13 digits name each folder, growing: [5, 6])'], 'its levels said')
  t.alike(said({ type: 'offset-files', levels: [5, 6], batch: 0 }), ['mrepo/data/sets/.layer.json: structure batch (a number of records)'])
})

test('explicit, always: a streaming layer declares its structure; without it the layer is a folder: said', (t) => {
  const said = (layer, config) => {
    const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
    try {
      write(d, { ...good, [`mrepo/${layer}/.layer.json`]: { mode: 'non-atomic', description: 'A layer.', ...config } })
      return checkStructure(d).map(p => p.detail)
    } finally { rmSync(d, { recursive: true, force: true }) }
  }
  const missing = l => [`mrepo/${l}/.layer.json: no structure declared (a streaming layer says it: "structure": { "type": "offset-files", "levels": [5, 6] }; without it the layer is a folder)`]
  for (const l of ['inbox', 'outbox', 'request/done']) {
    t.alike(said(l, {}), missing(l), `${l}: no structure declared: said`)
    t.alike(said(l, { structure: { type: 'tree' } }), missing(l), `${l}: declared a plain tree: not a stream, said`)
    t.alike(said(l, { structure: { type: 'offset-files', levels: [5, 6] } }), [], `${l}: declared`)
  }
  t.alike(said('request/execute', {}), [], 'a layer that does not stream: nothing to declare')
})

test('the names a package lays into its layers: a URI\'s, or hidden and one of those there are', (t) => {
  const d = mkdtempSync(join(tmpdir(), 'mrepo-'))
  try {
    write(d, { ...good, 'mrepo/main/swarms/.node.json': {}, 'mrepo/main/swarms/.shortcuts.json': [], 'mrepo/main/notes/a-1.json': {} })
    t.alike(checkStructure(d), [], 'a layer\'s config, a node\'s document and shortcuts, data by a URI\'s name: none')
    write(d, { 'mrepo/main/.settings.json': {}, 'mrepo/main/Notes/a.json': {}, 'mrepo/main/a_b.json': {}, 'mrepo/main/layer.json': {} })
    t.alike(checkStructure(d).map(p => p.detail).sort(), [
      'mrepo/main/.settings.json: a hidden name there is none of (.layer.json, .node.json, .shortcuts.json, .lock, .pointer.json)',
      'mrepo/main/Notes: not a URI\'s name (lowercase letters, digits, hyphens, its extensions; hidden: a name starting with a dot)',
      'mrepo/main/a_b.json: not a URI\'s name (lowercase letters, digits, hyphens, its extensions; hidden: a name starting with a dot)'
    ], 'a hidden name the rules do not know, an uppercase name, an underscore: each said; layer.json without its dot is data like any other')
  } finally { rmSync(d, { recursive: true, force: true }) }
})
