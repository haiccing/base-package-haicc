// read: crud/read <URI>, the nodes a URI selects (README.md beside it).
import { place, select } from '../../internal/node/index.js'

// log: in select (../../internal/node/index.js): each node; the query's steps in mrepo-base-xpath
export async function read (exec, { uri }) {
  return (await select(exec, place(uri))).map(s => s.node)
}
