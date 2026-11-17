// A module's test page against its tests: a section a file, each test by
// its name; a template name a pattern.
import test from 'brittle'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'bare-fs'
import { join, dirname } from 'bare-path'
import { tmpdir } from 'bare-os'
import { checkTestPage, testNames, pageSections } from '../index.js'

const tree = files => {
  const d = mkdtempSync(join(tmpdir(), 'tests-'))
  for (const [p, v] of Object.entries(files)) { mkdirSync(dirname(join(d, p)), { recursive: true }); writeFileSync(join(d, p), v) }
  return d
}
const Q = '`'
const SUITE = `import test from 'brittle'\nexport function suite (name) {\n  for (const n of [1, 2]) test(${Q}\${name}: run \${n}${Q}, (t) => {})\n}\n`

test('names: quoted, escaped, a template a pattern; a method named test is none', (t) => {
  const names = testNames(`test('one: it\\'s', (t) => {})\ntest("two", () => {})\ntest(${Q}\${name}: three (\${when})${Q}, () => {})\nt.ok(/x/.test(s))\n`)
  t.alike(names.map(n => n.name), ["one: it's", 'two', '${name}: three (${when})'])
  t.ok(names[2].pattern.test('native: three (today)'), 'a template: any text where it has ${...}')
  t.ok(names[2].pattern.test('three (today)'), 'its leading name may be left out')
  t.absent(names[2].pattern.test('four (today)'))
})

test('a page read: a section a file, an entry over several lines one', (t) => {
  t.alike(pageSections('# test/\n\nIts tests.\n\n## `a.test.js`\n\nWhat it does.\n\n- one\n- two, long,\n  on two lines\n\n## `b.test.js`\n\n- three\n'),
    { 'a.test.js': ['one', 'two, long, on two lines'], 'b.test.js': ['three'] })
})

test('a page that says what is tested: none', (t) => {
  const d = tree({
    'test/a.test.js': "import test from 'brittle'\ntest('one', () => {})\ntest('two', () => {})\n",
    'test/suite.js': SUITE,
    'test/fixture.sh': 'true\n',
    'test/README.md': '# test/\n\n## `a.test.js`\n\n- one\n- two\n\n## `suite.js`\n\n- run 1\n- run 2\n\n## `fixture.sh`\n\nNot a test.\n'
  })
  try { t.alike(checkTestPage(d), []) } finally { rmSync(d, { recursive: true, force: true }) }
})

test('a page that drifted: each difference a problem; no page, one', (t) => {
  const d = tree({
    'test/a.test.js': "import test from 'brittle'\ntest('one', () => {})\ntest('two, renamed', () => {})\n",
    'test/b.test.js': "import test from 'brittle'\ntest('three', () => {})\n",
    'test/README.md': '# test/\n\n## `a.test.js`\n\n- one\n- two\n\n## `gone.test.js`\n\n- four\n'
  })
  const bare = tree({ 'test/a.test.js': "import test from 'brittle'\ntest('one', () => {})\n" })
  try {
    t.alike(checkTestPage(d).map(p => p.detail).sort(), [
      'a.test.js: listed, no such test: two',
      'a.test.js: not listed: two, renamed',
      'b.test.js: no section',
      'gone.test.js: a section, no such file'
    ])
    t.alike(checkTestPage(bare).map(p => p.detail), ['not there: the page of its tests'])
  } finally { for (const x of [d, bare]) rmSync(x, { recursive: true, force: true }) }
})
