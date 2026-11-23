// What one commit changed against another: the paths added, changed and
// removed between their trees, files only, in path order. Only folders
// that differ are read: its cost is what changed, not the tree's size.
//   changes(backend, from, to) -> [{ path, change: 'added' | 'changed' | 'removed' }]
export async function changes (backend, from, to) {
  const out = []
  const entries = async tree => new Map((tree ? await backend.readTree(tree) : []).map(e => [e.name, e]))
  const walk = async (a, b, at) => {
    if (a === b) return
    const [before, after] = [await entries(a), await entries(b)]
    for (const name of [...new Set([...before.keys(), ...after.keys()])].sort()) {
      const [x, y] = [before.get(name), after.get(name)]
      const path = at ? `${at}/${name}` : name
      if (x && y && x.oid === y.oid && x.type === y.type) continue
      const folder = e => (e?.type === 'tree' ? e.oid : null)
      // a file where a folder was, or the other way round: the file added or removed, the folder walked
      if (x && x.type !== 'tree' && (!y || y.type === 'tree')) out.push({ path, change: 'removed' })
      if (folder(x) || folder(y)) await walk(folder(x), folder(y), path)
      if (y && y.type !== 'tree') out.push({ path, change: !x || x.type === 'tree' ? 'added' : 'changed' })
    }
  }
  await walk((await backend.readCommit(from)).tree, (await backend.readCommit(to)).tree, '')
  return out
}
