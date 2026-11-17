// A repository as one tree, for mycelium-xpath. Every path starts with a
// branch name, from the root: /main/x, /pending/default/pending/r1. Above
// the branches the tree is made of their name segments; a full branch name
// is its commit's tree. A name is never both a branch and a prefix, so this
// is unambiguous.
//
// Nodes: { type: 'branches', prefix } above the branches,
//        { type: 'tree', oid }, { type: 'blob', oid } below.

import { select as xselect } from 'mycelium-xpath'

export function openRepo (backend) {
  async function children (node) {
    if (node.type === 'blob') return null
    if (node.type === 'tree') {
      return (await backend.readTree(node.oid))
        .filter(e => e.type === 'tree' || e.type === 'blob')
        .map(e => [e.name, { type: e.type, oid: e.oid }])
    }
    // Above the branches: the next name segment of every branch under prefix.
    const next = new Map()
    for (const [name, commit] of await backend.listBranches()) {
      if (!name.startsWith(node.prefix)) continue
      const [segment, ...rest] = name.slice(node.prefix.length).split('/')
      if (next.has(segment)) continue
      next.set(segment, rest.length
        ? { type: 'branches', prefix: node.prefix + segment + '/' }
        : { type: 'tree', oid: (await backend.readCommit(commit)).tree })
    }
    return [...next]
  }

  const root = { type: 'branches', prefix: '' }

  return {
    // The tree itself, for a query (mycelium-xpath's): the one node at a
    // plain path, null when nothing is there; a node's children; a file's
    // content.
    async node (path) {
      const found = await xselect(children, root, path)
      return found.length === 1 ? found[0][1] : null
    },
    children,
    bytes (node) {
      if (node.type !== 'blob') throw new Error('not a file: a node of the tree')
      return backend.readBlob(node.oid)
    },

    // All nodes matching a path, as [path, node] pairs ('*' steps allowed).
    // Paths are stored names, matched exactly; the boundary passes match.
    select: (path, match) => xselect(children, root, path, match),

    // The content of the one blob at a path.
    async read (path, match) {
      const found = await xselect(children, root, path, match)
      if (found.length !== 1 || found[0][1].type !== 'blob') throw new Error(`not a file: ${path}`)
      return backend.readBlob(found[0][1].oid)
    },

    // The same, for a file that may not be there: null when nothing is at
    // the path. Something there that is not one file (a folder, several
    // matches) throws, as read does: only "not there" is told apart.
    async find (path, match) {
      const found = await xselect(children, root, path, match)
      if (!found.length) return null
      if (found.length !== 1 || found[0][1].type !== 'blob') throw new Error(`not a file: ${path}`)
      return backend.readBlob(found[0][1].oid)
    }
  }
}

// The same backend with its branches fixed to given commits: a repository at a
// recorded state, e.g. a unit's { branch: commit } map.
export function pinned (backend, state) {
  return { ...backend, listBranches: async () => Object.entries(state) }
}
