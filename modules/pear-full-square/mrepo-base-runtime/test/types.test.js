// What a runtime checks by, on a repository made for the test: types in
// its avro layer, a file a type at its URI.
import test from 'brittle'
import fs, { mkdtempSync, rmSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { p2pgitBackend, writer, openRepo } from 'mycelium-git'
import { typesOf, HELD, fileOf } from '../index.js'

const author = { name: 'test', email: 'test@localhost' }
const PART = { type: 'record', name: 'haiccing.basePackageX.part', fields: [{ name: 'n', type: 'long' }] }
const WHOLE = { type: 'record', name: 'haiccing.basePackageX.whole', fields: [{ name: 'title', type: 'string' }, { name: 'parts', type: { type: 'array', items: 'haiccing.basePackageX.part' }, default: [] }] }
const LONE = { type: 'record', name: 'haiccing.basePackageX.lone', fields: [{ name: 'p', type: 'haiccing.basePackageX.gone' }] }

// A repository, its avro layer holding these types (none: no avro layer).
async function repoWith (t, types) {
  const dir = mkdtempSync(join(tmpdir(), 'types-'))
  t.teardown(() => rmSync(dir, { recursive: true, force: true }))
  const backend = p2pgitBackend(join(dir, '.git'), { fs })
  await backend.init()
  const w = writer(backend)
  await w.createLayer('main', 'Create main', { author })
  if (types) {
    await w.createLayer('avro', 'Create avro', { author })
    const c = await w.change('avro')
    await c.put('/.layer.json', Buffer.from('{}'))
    for (const [uri, schema] of Object.entries(types)) await c.put(`/types/${uri}.avsc`, Buffer.from(JSON.stringify(schema)))
    await c.commit('Its types', { author })
  }
  return openRepo(backend)
}

test('the types an mrepo holds: read from its avro layer as its runtime starts; a type by its name, the types it names made with it; a value checked, strictly', async (t) => {
  t.alike([HELD, fileOf('haiccing/base-package-x/part')], ['/avro/types', '/avro/types/haiccing/base-package-x/part.avsc'], 'where: its own avro layer, a file a type at its URI')
  const types = await typesOf(await repoWith(t, { 'haiccing/base-package-x/part': PART, 'haiccing/base-package-x/whole': WHOLE, 'haiccing/base-package-x/lone': LONE }))
  t.alike(types.held, ['haiccing/base-package-x/lone', 'haiccing/base-package-x/part', 'haiccing/base-package-x/whole'], 'what it holds, by URI')
  t.is(types.type('haiccing/base-package-x/whole').name, 'haiccing.basePackageX.whole', 'a type by its URI; the one it names made first')
  t.is(types.type('haiccing/base-package-x/whole'), types.type('haiccing/base-package-x/whole'), 'made once, kept')
  t.alike(types.valid('haiccing/base-package-x/whole', { title: 'a', parts: [{ n: 1 }] }), { valid: true }, 'a value of it')
  t.alike(types.valid('haiccing/base-package-x/whole', { title: 'a', parts: [{ n: 'one' }] }).problems.map(p => p.at), ['parts/0/n'], 'not one: the place said')
  t.absent(types.valid('haiccing/base-package-x/whole', { title: 'a', more: 1 }).valid, 'strict: a field it does not name')
  t.exception(() => types.type('haiccing/base-package-x/none'), /type not held: haiccing\/base-package-x\/none \(not in this mrepo's avro layer, \/avro\/types\/haiccing\/base-package-x\/none\.avsc; a type not held is the schema registry's to give\)/, 'a type it does not hold: refused, said, with where it would be')
  t.exception(() => types.type('../packages/x'), /not a type's name/, 'a path out of it: refused')
  t.exception(() => types.type('haiccing/base-package-x/lone'), /type not held: haiccing\/base-package-x\/gone/, 'one that names a type it does not hold: said')
  t.is(types.type('haiccing/base-package-x/part').name, 'haiccing.basePackageX.part', 'one that failed left no name behind: the others still made')
  t.alike([types.type('avro/string').typeName, types.valid('avro/long', 3), types.held.includes('avro/string')], ['string', { valid: true }, false], 'one of AVRO\'s own, by its URI: a type it has without a file, not among what its layer holds')
  t.exception(() => types.type('avro/array'), /not a type of AVRO's own: avro\/array/, 'avro/ and none: said')
})

test('an mrepo with no avro layer, or nothing in it: it holds none', async (t) => {
  t.alike((await typesOf(await repoWith(t, null))).held, [], 'no avro layer')
  t.alike((await typesOf(await repoWith(t, {}))).held, [], 'nothing in it')
})
