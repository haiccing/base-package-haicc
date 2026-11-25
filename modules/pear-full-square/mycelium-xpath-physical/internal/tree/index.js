// tree: a plain tree, read as it is stored (README.md beside it).

// its one physical query: the logical one
export const next = set => (set.reached === null ? set.logical.query : null)
// its logical address: where it is stored
export const addressOf = (set, path) => path
// its result: the whole answer
export const took = (set, text, result) => ({ nodes: result.found, stopped: result.stopped, reached: 'end', done: true, full: true })
