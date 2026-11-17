// The contract suite: the same tests, run against every backend.
//   contract(name, makeBackend), makeBackend(gitdir) → backend (or a promise)
// Each run builds the fixture repository (test/fixture.sh).

import test, { hook } from 'brittle'
import { spawnSync } from 'bare-subprocess'
import { mkdtempSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { openRepo, pinned, writer } from '../index.js'
import { query } from 'mycelium-xpath'
import { sameName } from 'mycelium-uri'

// A command run to its end (Bare's bare-subprocess has no execFileSync): its
// output; a failure throws, with what it said.
const execFileSync = (cmd, args) => { const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')}: exit ${r.status}: ${String(r.stderr)}`); return r.stdout }

export function fixture () {
  const dir = join(mkdtempSync(join(tmpdir(), 'mycelium-git-')), 'repo')
  execFileSync('sh', [new URL('./fixture.sh', import.meta.url).pathname, dir])
  return dir
}

const paths = found => found.map(([p]) => p)
const author = { name: 'test', email: 'test@localhost' }
const time = '2026-01-02T00:00:00Z'

export function contract (name, makeBackend) {
  // Reading: one fixture, never written.
  let repo, backend
  hook(`${name}: its fixture`, async () => {
    backend = await makeBackend(fixture())
    repo = openRepo(backend)
  })
  test(`${name}: above the branches: name segments`, async (t) => {
    t.alike(paths(await repo.select('/*')), ['/execute', '/main', '/overlay', '/pending'])
    t.alike(paths(await repo.select('/pending/*')), ['/pending/default'])
    t.alike(paths(await repo.select('/*/*')), ['/execute/main', '/main/README.md', '/main/docs', '/main/readme', '/overlay/config', '/pending/default'])
  })

  test(`${name}: into a branch`, async (t) => {
    t.alike(paths(await repo.select('/main/*')), ['/main/README.md', '/main/docs', '/main/readme'])
    t.alike(paths(await repo.select('/pending/default/pending/*')), ['/pending/default/pending/r1'])
    t.alike(paths(await repo.select('/*/docs/a')), ['/main/docs/a'])
    t.alike(paths(await repo.select('/*/*/docs/a')), ['/execute/main/docs/a', '/overlay/config/docs/a'])
    t.alike(await repo.select('/main/nope'), [])
  })

  test(`${name}: the tree itself, for a query: a node, its children, a file's content`, async (t) => {
    const main = await repo.node('/main')
    t.is(main.type, 'tree', 'the one node at a plain path')
    t.alike([await repo.node('/main/nope'), await repo.node('/nobranch'), await repo.node('/main/*')], [null, null, null], 'nothing there, or not one: null')
    t.alike((await repo.children(main)).map(([n, c]) => [n, c.type]), [['README.md', 'blob'], ['docs', 'tree'], ['readme', 'blob']])
    const readme = await repo.node('/main/readme')
    t.alike([await repo.children(readme), (await repo.bytes(readme)).toString()], [null, 'hello'], 'a file: no children, its content')
    await t.exception(async () => repo.bytes(main), /not a file/)
    t.alike((await repo.children(await repo.node('/pending'))).map(([n, c]) => [n, c.type]), [['default', 'tree']], 'above the branches too')
    // a query over it (mycelium-xpath): a file's document its text
    const tree = { children: repo.children, document: async n => (n.type === 'blob' ? (await repo.bytes(n)).toString() : null) }
    t.alike((await query(tree, main, "*[a='A']/b")).found.map(f => f.path), ['/docs/b'], 'a filter on a file\'s content, then on')
    t.alike((await query(tree, await repo.node('/'), "*/*[.='hello']")).found.map(f => f.path), ['/main/readme'], 'from the root, across branches')
  })

  test(`${name}: find: a file that may not be there`, async (t) => {
    t.is((await repo.find('/main/readme')).toString(), 'hello', 'there: its content')
    t.is(await repo.find('/main/nope'), null, 'not there: null')
    t.is(await repo.find('/nobranch/readme'), null, 'nor its branch')
    await t.exception(repo.find('/main/docs'), /not a file: \/main\/docs/, 'a folder: not a file, as read says')
    await t.exception(repo.find('/main/docs/*'), /not a file/, 'several: the same')
  })

  test(`${name}: read`, async (t) => {
    t.is((await repo.read('/main/readme')).toString(), 'hello')
    t.is((await repo.read('/overlay/config/docs/a')).toString(), 'conf')
    t.is((await repo.read('/main/README.md')).toString(), 'convention')
    await t.exception(repo.read('/main/readme.md'), /not a file/)
    t.is((await repo.read('/main/readme.md', sameName)).toString(), 'convention')
    await t.exception(repo.read('/main/docs'), /not a file/)
    await t.exception(repo.read('/main/nope'), /not a file/)
  })

  test(`${name}: pinned: a repository at a recorded state`, async (t) => {
    const branches = Object.fromEntries(await backend.listBranches())
    const old = openRepo(pinned(backend, { main: branches.main }))
    t.alike(paths(await old.select('/*')), ['/main'])
    t.is((await old.read('/main/readme')).toString(), 'hello')
  })

  // Writing: a fixture of its own, written in sequence.
  let wb, wrepo, w, wdir
  hook(`${name}: its fixture`, async () => {
    wdir = fixture()
    wb = await makeBackend(wdir)
    wrepo = openRepo(wb)
    w = writer(wb)
  })
  const head = async b => Object.fromEntries(await wb.listBranches())[b]
  const text = async p => (await wrepo.read(p)).toString()

  test(`${name}: change: put and remove, one commit`, async (t) => {
    const before = await head('main')
    const c = await w.change('main')
    await c.put('/notes/one.md', 'one')
    await c.put('/notes/two.md', 'two')
    await c.put('/readme', 'changed')
    c.remove('/docs/b')
    const oid = await c.commit('Change main', { author, time })
    t.is(await head('main'), oid)
    t.alike((await wb.readCommit(oid)).parents, [before])
    t.is(await text('/main/notes/two.md'), 'two')
    t.is(await text('/main/readme'), 'changed')
    t.alike((await wrepo.select('/main/docs/*')).map(([p]) => p), ['/main/docs/a'])
  })

  test(`${name}: a tree's entries come in git's order`, async (t) => {
    // Git orders a tree's entries by name, a folder's as if it ended in
    // '/': 'a-b' (a file) before 'a' (a folder), where plain name order
    // gives the reverse. Selection follows the tree, so every engine gives
    // git's order.
    const c = await w.change('main')
    await c.put('/order/a-b', 'file')
    await c.put('/order/a/c', 'in a folder')
    await c.commit('Order', { author, time })
    t.alike((await wrepo.select('/main/order/*')).map(([p]) => p), ['/main/order/a-b', '/main/order/a'])
    const c2 = await w.change('main')
    c2.remove('/order/a-b')
    c2.remove('/order/a/c')
    await c2.commit('Order removed', { author, time })
  })

  test(`${name}: change: emptied folders disappear`, async (t) => {
    const c = await w.change('main')
    c.remove('/notes/one.md')
    c.remove('/notes/two.md')
    await c.commit('Remove notes', { author, time })
    t.alike(await wrepo.select('/main/notes'), [])
  })

  test(`${name}: change: conflicts and missing paths throw`, async (t) => {
    const a = await w.change('main')
    await a.put('/docs', 'file over folder')
    await t.exception(a.commit('x', { author, time }), /conflict: \/docs is a folder/)
    const b = await w.change('main')
    await b.put('/readme/x', 'folder under file')
    await t.exception(b.commit('x', { author, time }), /conflict: \/readme is a file/)
    const c = await w.change('main')
    c.remove('/nope')
    await t.exception(c.commit('x', { author, time }), /not found: \/nope/)
    await t.exception(w.change('nope'), /no branch: nope/)
  })

  test(`${name}: change: a concurrent change fails, nothing is overwritten`, async (t) => {
    const a = await w.change('main')
    const b = await w.change('main')
    await a.put('/a', 'a')
    await b.put('/b', 'b')
    await a.commit('a', { author, time })
    await t.exception(b.commit('b', { author, time }))
    t.alike(await wrepo.select('/main/b'), [])
  })

  test(`${name}: merge: plain merge commit, nothing to do when merged`, async (t) => {
    const main = await head('main')
    await w.merge('main', 'execute/main', 'sync', { author, time, fastForward: true })
    const c = await w.change('execute/main')
    await c.put('/responses/r1.md', 'done')
    const exec = await c.commit('Respond', { author, time })
    const m = await w.merge('execute/main', 'main', 'Merge execute/main', { author, time })
    t.alike((await wb.readCommit(m)).parents, [main, exec])
    t.is(await text('/main/responses/r1.md'), 'done')
    t.is(await w.merge('execute/main', 'main', 'again', { author, time }), m)
  })

  test(`${name}: merge: fast-forward only when asked`, async (t) => {
    const main = await head('main')
    t.is(await w.merge('main', 'execute/main', 'sync', { author, time, fastForward: true }), main)
    t.is(await head('execute/main'), main)
  })

  test(`${name}: merge: disjoint layers are never merged`, async (t) => {
    await t.exception(w.merge('overlay/config', 'main', 'm', { author, time }), /disjoint layers/)
  })

  test(`${name}: createLayer: orphans under layer segments, leaves only`, async (t) => {
    const oid = await w.createLayer('data/sets', 'Create data/sets', { author, time })
    t.alike((await wb.readCommit(oid)).parents, [])
    t.alike(await wrepo.select('/data/sets/*'), [])
    await t.exception(w.createLayer('data/sets', 'x', { author, time }), /exists: data\/sets/)
    await t.exception(w.createLayer('data/sets/more', 'x', { author, time }), /not a leaf/)
    await t.exception(w.createLayer('overlay', 'x', { author, time }), /not a layer: overlay/)
    await t.exception(w.createLayer('overlay/config/x', 'x', { author, time }), /not a leaf/)
    await t.exception(w.createLayer('execute/main', 'x', { author, time }), /not a layer/)
    await t.exception(w.createLayer('publish/x', 'x', { author, time }), /not a layer/)
    await t.exception(w.createLayer('main/x', 'x', { author, time }), /not a layer/)
    await t.exception(w.createLayer('other/x', 'x', { author, time }), /not a layer/)
  })

  test(`${name}: createExecution and deleteBranch: only once merged`, async (t) => {
    const c = await w.change('data/sets')
    await c.put('/a.md', 'a')
    await c.commit('Put', { author, time })
    const from = await w.createExecution('data/sets')
    t.is(await head('execute/data/sets'), from)
    await t.exception(w.createExecution('data/sets'), /exists/)
    await t.exception(w.createExecution('nope'), /no branch: nope/)
    const d = await w.change('execute/data/sets')
    await d.put('/b.md', 'b')
    await d.commit('Respond', { author, time })
    await t.exception(w.deleteBranch('execute/data/sets', 'data/sets'), /not merged/)
    await w.merge('execute/data/sets', 'data/sets', 'Merge', { author, time })
    await w.deleteBranch('execute/data/sets', 'data/sets')
    t.is(await head('execute/data/sets'), undefined)
    t.is(await text('/data/sets/b.md'), 'b')
    await t.exception(w.deleteBranch('main', 'execute/main'), /permanent: main/)
    await t.exception(w.deleteBranch('nope', 'main'), /no branch: nope/)
  })

  // On disk (a Hyperdrive has no folders): what the ref's folders are after.
  test(`${name}: a deleted branch takes the folders it leaves empty`, async (t) => {
    const refs = join(wdir, 'refs', 'heads')
    await w.createExecution('main', 'k1')
    await wb.updateBranch('execute/k1/request/execute', await head('main'), null)
    await wb.updateBranch('execute/k2/main', await head('main'), null)
    // one of two in execute/k1: its own folder goes, execute/k1 stays
    await wb.deleteBranch('execute/k1/request/execute', await head('execute/k1/request/execute'))
    t.absent(existsSync(join(refs, 'execute', 'k1', 'request')), 'the folders it alone was in: gone')
    t.is(await head('execute/k1/main'), await head('main'), 'the branch beside it: there')
    // the last in execute/k1: the folder goes; execute, the first segment's, stays
    await wb.deleteBranch('execute/k1/main', await head('execute/k1/main'))
    t.absent(existsSync(join(refs, 'execute', 'k1')), 'the key\'s folder: gone')
    t.is(await head('execute/k2/main'), await head('main'), 'another key\'s branch: there')
    await wb.deleteBranch('execute/k2/main', await head('execute/k2/main'))
    t.absent(existsSync(join(refs, 'execute', 'k2')))
    // a branch made where a folder was removed
    await wb.updateBranch('execute/k1/main', await head('main'), null)
    t.is(await head('execute/k1/main'), await head('main'), 'made again where its folder was removed')
    await wb.deleteBranch('execute/k1/main', await head('execute/k1/main'))
    t.alike((await wb.listBranches()).map(([b]) => b).filter(b => b.startsWith('execute/k')), [])
  })

  test(`${name}: commitTree: a checkpoint replacing the whole tree`, async (t) => {
    const before = await head('data/sets')
    const blob = await wb.writeBlob('only')
    const tree = await wb.writeTree([{ name: 'only.md', mode: '100644', type: 'blob', oid: blob }])
    const oid = await w.commitTree('data/sets', tree, 'Replace', { author, time })
    t.alike((await wb.readCommit(oid)).parents, [before])
    t.alike((await wrepo.select('/data/sets/*')).map(([p]) => p), ['/data/sets/only.md'])
    await t.exception(w.commitTree('nope', tree, 'x', { author, time }), /no branch: nope/)
  })

  test(`${name}: init: a new, empty, bare repository`, async (t) => {
    const dir = join(mkdtempSync(join(tmpdir(), 'init-')), 'new')
    const b = await makeBackend(dir)
    await b.init()
    t.alike(await b.listBranches(), [])
    const tree = await b.writeTree([])
    const c = await b.writeCommit({ tree, parents: [], message: 'First', author, time })
    await b.updateBranch('main', c, null)
    t.alike(await b.listBranches(), [['main', c]])
  })

  test(`${name}: raw objects: read, write, has`, async (t) => {
    const main = await head('main')
    const { type, object } = await wb.readObject(main)
    t.is(type, 'commit')
    t.is(await wb.writeObject(type, object), main)
    t.ok(await wb.hasObject(main))
    t.ok(!await wb.hasObject('0123456789012345678901234567890123456789'))
  })

  test(`${name}: importLayer: new under the layer rules, existing only forward`, async (t) => {
    const start = await head('data/sets')
    const c = await w.change('data/sets')
    await c.put('/c.md', 'c')
    const next = await c.commit('Put', { author, time })
    await t.exception(w.importLayer('data/copy', '0123456789012345678901234567890123456789'), /no commit/)
    t.is(await w.importLayer('data/copy', start), start)
    t.is(await w.importLayer('data/copy', start), start)
    t.is(await w.importLayer('data/copy', next), next)
    await t.exception(w.importLayer('data/copy', start), /diverged: data\/copy/)
    await t.exception(w.importLayer('other/x', start), /not a layer/)
    await t.exception(w.importLayer('data/copy/x', start), /not a leaf/)
  })

  test(`${name}: merge: conflicts throw`, async (t) => {
    await wb.updateBranch('side', await head('main'), null)
    const a = await w.change('main')
    await a.put('/readme', 'main says')
    await a.commit('a', { author, time })
    const b = await w.change('side')
    await b.put('/readme', 'side says')
    await b.commit('b', { author, time })
    await t.exception(w.merge('side', 'main', 'm', { author, time }), /merge conflicts: readme/)
  })

  // Commits written directly, a second apart and all in one second: the
  // walk is ordered by date, its answer must not depend on it.
  for (const [dates, clock] of [['a second apart', n => new Date(Date.UTC(2026, 0, 3, 0, 0, n)).toISOString()], ['all in one second', () => time]]) {
    test(`${name}: isAncestor: which history holds which (${dates})`, async (t) => {
      const ab = await makeBackend(fixture())
      const tree = (await ab.readCommit(Object.fromEntries(await ab.listBranches()).main)).tree
      let n = 0
      const commit = (...parents) => ab.writeCommit({ tree, parents, message: `c${n}`, author, time: clock(n++) })
      const chain = async (from, length) => { const out = []; for (let k = 0; k < length; k++) out.push(from = await commit(from)); return out }
      const root = await commit()
      const trunk = await chain(root, 6)
      const side = await chain(trunk[1], 4) // leaves the trunk early
      const merged = await commit(trunk[5], side[3])
      const later = await chain(merged, 3)
      const apart = await chain(trunk[3], 5) // never merged
      const yes = async (a, b, what) => t.ok(await ab.isAncestor(a, b), what)
      const no = async (a, b, what) => t.absent(await ab.isAncestor(a, b), what)
      await yes(root, root, 'itself')
      await yes(root, later[2], 'the root, far below')
      await yes(trunk[5], merged, 'a merge\'s first parent')
      await yes(side[3], merged, 'a merge\'s second parent')
      await yes(side[0], later[2], 'through the merge\'s second parent')
      await no(later[2], side[0], 'the other way round')
      await no(merged, trunk[5], 'a merge is not in its parent\'s history')
      await no(side[3], trunk[5], 'a side branch not merged yet')
      await no(trunk[5], side[3], 'nor the trunk in it')
      await no(apart[4], later[2], 'diverged: not in the trunk')
      await no(later[2], apart[4], 'diverged: nor the trunk in it')
      await yes(trunk[3], apart[4], 'where it left the trunk')
      // a merge that reaches an old commit directly: nearer than the commit asked about
      const shortcut = await commit(later[2], root)
      await yes(side[2], shortcut, 'beyond a nearer common commit')
      await no(apart[0], shortcut)
      // unrelated histories
      const other = await chain(await commit(), 2)
      await no(other[1], later[2], 'unrelated')
      await no(later[2], other[1])
    })
  }

  // A fixture of its own: what main's history holds is counted.
  test(`${name}: squash: one commit on the target, the branch left as it is`, async (t) => {
    const sb = await makeBackend(fixture())
    const srepo = openRepo(sb)
    const sw = writer(sb)
    const at = async b => Object.fromEntries(await sb.listBranches())[b]
    const read = async p => (await srepo.read(p)).toString()
    const main = await at('main')
    // the target not moved: the branch's tree, one parent
    await sw.createExecution('main', 'k1')
    for (const n of ['one', 'two']) { const c = await sw.change('execute/k1/main'); await c.put(`/responses/${n}.md`, n); await c.commit(n, { author, time }) }
    const branch = await at('execute/k1/main')
    const s1 = await sw.squash('execute/k1/main', 'main', 'k1: squashed', { author, time })
    t.is(await at('main'), s1)
    t.alike((await sb.readCommit(s1)).parents, [main], 'one parent: the target\'s head')
    t.is((await sb.readCommit(s1)).tree, (await sb.readCommit(branch)).tree, 'the branch\'s tree')
    t.is(await read('/main/responses/two.md'), 'two')
    t.is(await at('execute/k1/main'), branch, 'the branch left as it is')
    t.absent(await sb.isAncestor(branch, s1), 'its commits not in the target\'s history')
    // the target moved meanwhile, other paths: merged, still one parent
    await sw.createExecution('main', 'k2')
    const c2 = await sw.change('execute/k2/main'); await c2.put('/responses/three.md', 'three'); await c2.commit('three', { author, time })
    const m = await sw.change('main'); await m.put('/elsewhere.md', 'meanwhile'); const moved = await m.commit('meanwhile', { author, time })
    const s2 = await sw.squash('execute/k2/main', 'main', 'k2: squashed', { author, time })
    t.alike((await sb.readCommit(s2)).parents, [moved])
    t.is(await read('/main/responses/three.md'), 'three')
    t.is(await read('/main/elsewhere.md'), 'meanwhile')
    // the same path on both: conflicts throw, the target stays
    await sw.createExecution('main', 'k3')
    const c3 = await sw.change('execute/k3/main'); await c3.put('/readme', 'the branch says'); await c3.commit('branch', { author, time })
    const m3 = await sw.change('main'); await m3.put('/readme', 'main says'); const stays = await m3.commit('main', { author, time })
    await t.exception(sw.squash('execute/k3/main', 'main', 'k3', { author, time }), /merge conflicts: readme/)
    t.is(await at('main'), stays)
    // nothing to do: the target holds the branch; the branch changed nothing in the end
    await sw.createExecution('main', 'k4')
    t.is(await sw.squash('execute/k4/main', 'main', 'k4', { author, time }), stays, 'a branch that did not move')
    const c4 = await sw.change('execute/k4/main'); await c4.put('/tmp.md', 'x'); await c4.commit('put', { author, time })
    const d4 = await sw.change('execute/k4/main'); d4.remove('/tmp.md'); await d4.commit('removed again', { author, time })
    t.is(await sw.squash('execute/k4/main', 'main', 'k4', { author, time }), stays, 'put and removed again: no commit')
    // disjoint layers, a missing branch
    await t.exception(sw.squash('pending/default', 'main', 'x', { author, time }), /disjoint layers/)
    await t.exception(sw.squash('nope', 'main', 'x', { author, time }), /no branch: nope/)
    // a squashed branch squashed again after more work: only the new work arrives
    const c1 = await sw.change('execute/k1/main'); await c1.put('/responses/four.md', 'four'); await c1.commit('four', { author, time })
    await sw.squash('execute/k1/main', 'main', 'k1: again', { author, time })
    t.is(await read('/main/responses/four.md'), 'four')
    t.is(await read('/main/readme'), 'main says', 'what the target had meanwhile: kept')
  })
}
