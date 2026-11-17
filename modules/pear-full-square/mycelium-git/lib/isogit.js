// isomorphic-git backend: the backend contract on isomorphic-git, over a
// filesystem (node's fs by default). For compatibility: the same repository,
// read and written by an engine that also runs where native git does not.
// isoStyleBackend serves any engine with isomorphic-git's API (p2p-git).

import nodeFs from 'bare-fs'
import isogit from 'isomorphic-git'

export function isogitBackend (gitdir, { fs = nodeFs } = {}) {
  return isoStyleBackend(isogit, gitdir, { fs })
}

export function isoStyleBackend (git, gitdir, { fs = nodeFs } = {}) {
  const at = { fs, gitdir }
  const seconds = time => Math.floor((time ? new Date(time) : new Date()).getTime() / 1000)

  return {
    // A new repository: bare, with main as its default branch.
    async init () {
      await git.init({ ...at, bare: true, defaultBranch: 'main' })
    },

    // --- Reading ---

    // A branch listed while another process is writing its ref (written in
    // place by the engine: for an instant unreadable) is resolved again,
    // briefly; still not there, it was deleted meanwhile: not listed.
    // The engine lists nothing when its walk of the refs is disturbed (a
    // branch removed by another process meanwhile: a request branch, made
    // and removed with every request): an empty listing is asked for again,
    // briefly; a repository with no branch at all is rare (a new one).
    async listBranches () {
      let names = []
      for (let i = 0; i < 10 && !names.length; i++) {
        if (i) await new Promise(resolve => setTimeout(resolve, 5))
        names = (await git.listBranches(at)).sort()
      }
      const resolved = async n => {
        for (let i = 0; ; i++) {
          // catch: its ref unreadable for an instant (written in place), or gone: again, then not listed
          try { return await git.resolveRef({ ...at, ref: `refs/heads/${n}` }) } catch {
            if (i >= 40) return null
            await new Promise(resolve => setTimeout(resolve, 5))
          }
        }
      }
      return (await Promise.all(names.map(async n => [n, await resolved(n)]))).filter(([, oid]) => oid)
    },

    async readCommit (oid) {
      const { commit } = await git.readCommit({ ...at, oid })
      return { tree: commit.tree, parents: commit.parent, message: commit.message }
    },

    // A tree's entries in git's order, as native git gives them (a folder's
    // name compared as if it ended in '/'); isomorphic-git sorts by plain
    // name.
    async readTree (oid) {
      const { tree } = await git.readTree({ ...at, oid })
      return tree.map(e => ({ name: e.path, mode: e.mode, type: e.type, oid: e.oid })).sort(gitOrder)
    },

    async readBlob (oid) {
      return Buffer.from((await git.readBlob({ ...at, oid })).blob)
    },

    // Raw objects, for copying between repositories: { type, object }.
    async readObject (oid) {
      const { type, object } = await git.readObject({ ...at, oid, format: 'content' })
      return { type, object: Buffer.from(object) }
    },

    async hasObject (oid) {
      // catch: not there is the answer
      try { await git.readObject({ ...at, oid, format: 'deflated' }); return true } catch { return false }
    },

    // --- Writing ---

    async writeObject (type, bytes) {
      return git.writeObject({ ...at, type, object: Buffer.from(bytes), format: 'content' })
    },

    async writeBlob (bytes) {
      return git.writeBlob({ ...at, blob: Buffer.from(bytes) })
    },

    async writeTree (entries) {
      return git.writeTree({ ...at, tree: entries.map(e => ({ mode: e.mode, path: e.name, oid: e.oid, type: e.type })) })
    },

    async writeCommit ({ tree, parents, message, author, time }) {
      const who = { name: author.name, email: author.email, timestamp: seconds(time), timezoneOffset: 0 }
      return git.writeCommit({ ...at, commit: { tree, parent: parents, author: who, committer: who, message } })
    },

    // Compare-and-swap. isomorphic-git has no atomic compare-and-swap, so
    // this compares, then writes: safe against a stale change, not against
    // a writer racing in between.
    async updateBranch (name, oid, expected) {
      const ref = `refs/heads/${name}`
      let current = null
      // catch: no such branch yet: null, compared with what is expected
      try { current = await git.resolveRef({ ...at, ref }) } catch {}
      if (current !== (expected || null)) {
        throw new Error(`git update-ref: ${ref} is at ${current}, expected ${expected}`)
      }
      // Its folder removed under it (a branch beside it deleted meanwhile,
      // deleteBranch below): written once more.
      try { await git.writeRef({ ...at, ref, value: oid, force: true }) } catch (err) {
        if (err.code !== 'ENOENT') throw err
        await git.writeRef({ ...at, ref, value: oid, force: true })
      }
    },

    // Compare, then delete: as updateBranch, no atomic compare-and-swap.
    // The folders the ref leaves empty go with it, as native git removes
    // them (the engine leaves them, and every listing of the branches
    // walks them: execute/<key>/ of every request done). Up to the first
    // segment's folder, which stays: the layers' and execute's, shared by
    // all. Only an empty folder is removed (rmdir): one another branch is
    // in stays, and the walk up ends there.
    async deleteBranch (name, expected) {
      const ref = `refs/heads/${name}`
      const current = await git.resolveRef({ ...at, ref })
      if (current !== expected) throw new Error(`git update-ref: ${ref} is at ${current}, expected ${expected}`)
      await git.deleteRef({ ...at, ref })
      const segments = name.split('/')
      for (let n = segments.length - 1; n >= 1; n--) {
        // catch: not empty (another branch is in it), or gone already: it stays, and so do those above
        try { await fs.promises.rmdir(`${gitdir}/refs/heads/${segments.slice(0, n).join('/')}`) } catch { break }
      }
    },

    // --- History and merge ---

    async mergeBase (a, b) {
      const [base] = await git.findMergeBase({ ...at, oids: [a, b] })
      return base || null
    },

    // Is a in b's history. Not by walking all of b's history (the engine's
    // isDescendent: it grows with every commit, and a merge asks this of a
    // branch that is not in it yet), but as git does it: both histories
    // walked together, the newest commit first, each commit marked with
    // which of the two reaches it; one both reach is stale, and so is all
    // below it. The walk ends when b reaches a (yes), when a reaches b (no:
    // b is in a's history, not the other way round), or when only stale
    // commits are left (no). It reads what the two have apart and little
    // more, whatever lies below. The dates only order the walk: skewed
    // clocks cost time, not the answer.
    async isAncestor (a, b) {
      if (a === b) return true
      const FROM_A = 1; const FROM_B = 2; const STALE = 4
      const marks = new Map([[a, FROM_A], [b, FROM_B]])
      const commits = new Map()
      const load = async oid => {
        if (!commits.has(oid)) { const { commit } = await git.readCommit({ ...at, oid }); commits.set(oid, { date: commit.committer.timestamp, parents: commit.parent }) }
        return commits.get(oid)
      }
      await load(a); await load(b)
      const queue = [a, b]
      while (queue.some(oid => !(marks.get(oid) & STALE))) {
        let newest = 0
        for (let j = 1; j < queue.length; j++) if (commits.get(queue[j]).date > commits.get(queue[newest]).date) newest = j
        const [oid] = queue.splice(newest, 1)
        let mark = marks.get(oid)
        if ((mark & FROM_A) && (mark & FROM_B)) { mark |= STALE; marks.set(oid, mark) }
        for (const parent of commits.get(oid).parents) {
          const had = marks.get(parent) ?? 0
          if ((had | mark) === had) continue
          marks.set(parent, had | mark)
          if (parent === a && (mark & FROM_B)) return true
          if (parent === b && (mark & FROM_A)) return false
          await load(parent)
          if (!queue.includes(parent)) queue.push(parent)
        }
      }
      return false
    },

    // isomorphic-git stores a merged tree only with a real merge, so this
    // merges without moving any branch and takes the tree. The merge commit
    // it makes is never referenced (the writer makes its own); git's garbage
    // collection removes it.
    async mergeTrees (ours, theirs) {
      try {
        const r = await git.merge({
          ...at, ours, theirs, noUpdateBranch: true, abortOnConflict: true,
          author: { name: 'merge', email: 'merge@localhost' }
        })
        return { tree: r.tree || (await git.readCommit({ ...at, oid: r.oid })).commit.tree, conflicts: [] }
      } catch (err) {
        if (err.code === 'MergeConflictError') return { tree: null, conflicts: err.data.filepaths }
        throw err
      }
    }
  }
}

const sortKey = e => Buffer.from(e.type === 'tree' ? `${e.name}/` : e.name)
function gitOrder (a, b) {
  return Buffer.compare(sortKey(a), sortKey(b))
}
