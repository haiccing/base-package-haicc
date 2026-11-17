// The implementation validation: the patterns a package implements, read
// from its files; the how-tos naming them; a pattern without a how-to, a
// how-to naming no pattern.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { patternsOf, howtosOf, checkPatterns } from '../index.js'

const write = (d, files) => { for (const [p, v] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), typeof v === 'string' ? v : JSON.stringify(v)) } }
const tree = files => { const d = mkdtempSync(join(tmpdir(), 'patterns-')); write(d, files); return d }
const HOWTO = p => `# a how-to\n\nDoes it.\n\nPattern: ${p}\n\n## Steps\n\n\`\`\`sh\n# why\nls\n\`\`\`\n`

test('patterns: read from a package\'s files', (t) => {
  const made = []
  try {
    const protocol = tree({ 'package.json': {}, 'protocol.js': '', 'mrepo/links/layer.json': {}, 'mrepo/runtime/hooks/boot.haicc': 'a/b' }); made.push(protocol)
    const component = tree({ 'package.json': {}, 'mrepo/packages/layer.json': {}, 'mrepo/runtime/service.json': {}, 'scripts/start.sh': 'true' }); made.push(component)
    const docs = tree({ 'package.json': { docs: true }, 'mrepo/main/layer.json': {} }); made.push(docs)
    const app = tree({ 'package.json': {}, 'run.js': '' }); made.push(app)
    t.alike(patternsOf(protocol), ['package', 'protocol-package', 'layer', 'hooks'], 'a protocol package with a layer and hooks')
    t.alike(patternsOf(component), ['package', 'component', 'mrepo-definition', 'service', 'continuation-script'], 'a component: its list, a service, a script')
    t.alike(patternsOf(docs), ['package', 'documentation-package'], 'a documentation package: its layers are pages, not a layer it brings')
    t.alike(patternsOf(app), ['package', 'app'])
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
  } finally { for (const d of made) rmSync(d, { recursive: true, force: true }) }
})
