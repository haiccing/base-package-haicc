// The implementation validation: the patterns a package implements, read
// from its files; the how-tos naming them; a pattern without a how-to, a
// how-to naming no pattern.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { patternsOf, platformsOf, howtosOf, checkPatterns } from '../index.js'

const write = (d, files) => { for (const [p, v] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), typeof v === 'string' ? v : JSON.stringify(v)) } }
const tree = files => { const d = mkdtempSync(join(tmpdir(), 'patterns-')); write(d, files); return d }
const HOWTO = p => `# a how-to\n\nDoes it.\n\nPattern: ${p}\n\n## Steps\n\n\`\`\`sh\n# why\nls\n\`\`\`\n`

test('patterns: read from a package\'s files; a program started by a hook; a platform and its component', (t) => {
  const made = []
  try {
    const protocol = tree({ 'package.json': {}, 'protocol.js': '', 'mrepo/links/.layer.json': {}, 'mrepo/runtime/hooks/boot.haicc': 'a/b' }); made.push(protocol)
    const component = tree({ 'package.json': {}, 'mrepo/packages/.layer.json': {}, 'mrepo/runtime/service.json': {}, 'scripts/start.sh': 'true' }); made.push(component)
    const docs = tree({ 'package.json': { docs: true }, 'mrepo/main/.layer.json': {} }); made.push(docs)
    const app = tree({ 'package.json': {}, 'run.js': '' }); made.push(app)
    t.alike(patternsOf(protocol), ['package', 'protocol-package', 'layer', 'hooks'], 'a protocol package with a layer and hooks')
    t.alike(patternsOf(component), ['package', 'component', 'mrepo-definition', 'service', 'continuation-script'], 'a component: its list, a service, a script')
    t.alike(patternsOf(docs), ['package', 'documentation-package'], 'a documentation package: its layers are pages, not a layer it brings')
    t.alike(patternsOf(app), ['package', 'app'])
    const commissioned = tree({ 'package.json': {}, 'mrepo/packages/.layer.json': {}, 'mrepo/runtime/hooks/commission.haicc': 'boot/deploy docs haiccing/base-component-docs\nservice/initialise\n' }); made.push(commissioned)
    t.alike(patternsOf(commissioned), ['package', 'component', 'mrepo-definition', 'hooks', 'commission'], 'a commission: what the mrepo does once deployed')
    // a platform declaring its organisation; a component of it, its hooks starting its renderer
    const org = tree({ 'haiccing/p/package.json': { platform: 'splectral' }, 'haiccing/p/protocol.js': '', 'splectral/c/package.json': {}, 'splectral/c/mrepo/packages/.layer.json': {}, 'splectral/c/mrepo/runtime/hooks/start.haicc': '# start\nruntime/start . a/b\n' }); made.push(org)
    const platforms = platformsOf([join(org, 'haiccing', 'p'), join(org, 'splectral', 'c')])
    t.alike(platforms, ['splectral'], 'the organisation a platform declares')
    t.alike(patternsOf(join(org, 'haiccing', 'p'), { platforms }), ['package', 'protocol-package', 'platform'], 'a platform: by its declaration')
    t.alike(patternsOf(join(org, 'splectral', 'c'), { platforms }), ['package', 'component', 'mrepo-definition', 'hooks', 'program', 'splectral-component'], 'its component: a hook starting a program')
    t.alike(patternsOf(join(org, 'splectral', 'c')), ['package', 'component', 'mrepo-definition', 'hooks', 'program'], 'no platform declaring its organisation: a component only')
  } finally { for (const d of made) rmSync(d, { recursive: true, force: true }) }
})

test('how-tos: each naming its pattern; a pattern without one, a problem', (t) => {
  const made = []
  try {
    const docs = tree({ 'package.json': { docs: true }, 'howto/README.md': '# howto/\n\nIts how-tos.\n', 'howto/new/README.md': HOWTO('package'), 'howto/docs/README.md': HOWTO('documentation-package'), 'howto/odd/README.md': HOWTO('no-such') }); made.push(docs)
    const app = tree({ 'package.json': {}, 'run.js': '' }); made.push(app)
    t.alike(howtosOf(docs).map(h => [h.pattern, h.howto]).sort(), [['documentation-package', 'howto/docs'], ['no-such', 'howto/odd'], ['package', 'howto/new']], 'each how-to by the pattern it names')
    t.alike(checkPatterns([docs, app]).map(p => p.detail.split(':')[0]).sort(), ['app', docs.split('/').pop() + '/howto/odd'], 'app: implemented, no how-to; a how-to naming no pattern')
    t.alike(checkPatterns([docs]).map(p => p.detail.split(':')[0]), [docs.split('/').pop() + '/howto/odd'], 'what is implemented is covered: only the stray name')
    // a platform's component pattern: known once a platform declares its organisation
    const comp = tree({ 'package.json': {}, 'howto/README.md': '# howto/\n\nIts how-tos.\n', 'howto/c/README.md': HOWTO('myctral-component') }); made.push(comp)
    const plat = tree({ 'package.json': { platform: 'myctral' }, 'howto/README.md': '# howto/\n\nIts how-tos.\n', 'howto/p/README.md': HOWTO('platform'), 'howto/n/README.md': HOWTO('package') }); made.push(plat)
    t.alike(checkPatterns([comp]).map(p => p.detail.split(':')[0]).filter(d => d !== 'package'), [comp.split('/').pop() + '/howto/c'], 'no platform declares myctral: a how-to naming no pattern')
    t.alike(checkPatterns([comp, plat]), [], 'myctral declared: its component pattern known, the platform covered')
  } finally { for (const d of made) rmSync(d, { recursive: true, force: true }) }
})
