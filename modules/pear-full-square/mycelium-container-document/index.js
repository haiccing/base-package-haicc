// mycelium-container-document: a storage container:
// a folder of documents, one value per file, in the encoding it is given (a
// handler: { extension, encode, decode }, e.g. mycelium-value-json).
//   const box = documents(folder, json)
//   box.add(value)         a new document under a new name (time-ordered:
//                          13 digits of milliseconds, a hyphen, 8 hex; in
//                          one process, in the order added), its name
//   box.write(name, value) a document written: under a temporary name
//                          (<name>.<ext>.part), then renamed, so a reader
//                          never sees half of one; writers in parallel, each
//                          its own names
//   box.read(name)         its value
//   box.list()             its documents' names, in name order (time order
//                          for added ones); temporary files not among them
//   box.remove(name)
//   const log = stream(folder, json)   the folder as a stream of records
//                          (below): a record's name its offset
// The folder is made when first written. Names are the caller's: valid
// segments (mycelium-uri), validated where they come in.
import { writeFileSync, renameSync, readFileSync, readdirSync, mkdirSync, rmSync, existsSync, openSync, closeSync } from 'bare-fs'
import fsx from 'fs-native-extensions'
import { join } from 'bare-path'
import crypto from 'bare-crypto'

// Time-ordered: in one process strictly increasing (a millisecond on when two
// fall in the same); the random part keeps parallel writers apart.
let last = 0
export const newName = () => {
  last = Math.max(Date.now(), last + 1)
  return `${String(last).padStart(13, '0')}-${crypto.randomBytes(4).toString('hex')}`
}

export function documents (folder, encoding) {
  const ext = '.' + encoding.extension
  const file = name => join(folder, name + ext)
  const box = {
    folder,
    write (name, value) {
      mkdirSync(folder, { recursive: true })
      writeFileSync(file(name) + '.part', encoding.encode(value))
      renameSync(file(name) + '.part', file(name))
      return name
    },
    add: value => box.write(newName(), value),
    read: name => encoding.decode(readFileSync(file(name))),
    list: () => existsSync(folder) ? readdirSync(folder).filter(n => n.endsWith(ext)).map(n => n.slice(0, -ext.length)).sort() : [],
    remove: name => rmSync(file(name), { force: true })
  }
  return box
}

// A streaming folder: a record a file, its name its offset, the
// milliseconds since the epoch when it arrived (13 digits); offsets only
// grow, never two the same, not consecutive. Kept in buckets, folders
// named by a prefix of the offset, a level each length (5 digits: about
// 28 hours; 6: about 2.8), so no folder grows without end:
//   <folder>/17953/179531/1795312345678.json
// The buckets are the container's: a record is named by its offset alone.
//   const log = stream(folder, json, { buckets: [5, 6] })
//   log.create(value)      a record arrived: its offset given under the
//                          folder's lock (now, or the highest there plus
//                          one), written, -> its offset (a number). A
//                          function is called with the offset, for a
//                          record that says its own: create(o => ({...}))
//   log.reserve()          an offset given, no record written here: the
//                          stream as a clock for what arrives beside it
//   log.put(offset, value) a record under an offset given elsewhere (the
//                          same record in another folder: one name)
//   log.read(offset), log.has(offset), log.remove(offset)
//   log.list({ after, before, limit, ascending })
//                          its offsets, the newest first (the natural
//                          order, descending); after/before: offsets
//                          greater/less than; limit: at most so many
// The lock is the operating system's, on <folder>/.lock, held while an
// offset is given and its file written, released when its holder dies; the
// file holds the last offset given.
export const BUCKETS = [5, 6]
export const DIGITS = 13
export const LOCK = '.lock'
export const nameOf = offset => String(offset).padStart(DIGITS, '0')
export const isOffset = name => typeof name === 'string' && name.length === DIGITS && /^\d+$/.test(name)
// A record's place below its folder: its buckets, then its name.
export const bucketsOf = (offset, buckets = BUCKETS) => buckets.map(n => nameOf(offset).slice(0, n))
export const placeOf = (offset, buckets = BUCKETS) => [...bucketsOf(offset, buckets), nameOf(offset)].join('/')

export function stream (folder, encoding, { buckets = BUCKETS, now = Date.now } = {}) {
  const ext = '.' + encoding.extension
  const file = offset => join(folder, ...bucketsOf(offset, buckets), nameOf(offset) + ext)
  // the folders of one level, or the records of the last, in order
  const names = (dir, level) => existsSync(dir)
    ? readdirSync(dir).filter(n => level < buckets.length ? /^\d+$/.test(n) && n.length === buckets[level] : n.endsWith(ext) && isOffset(n.slice(0, -ext.length))).sort()
    : []
  function * walk (dir, level, ascending) {
    const here = names(dir, level)
    if (!ascending) here.reverse()
    for (const n of here) {
      if (level < buckets.length) yield * walk(join(dir, n), level + 1, ascending)
      else yield Number(n.slice(0, -ext.length))
    }
  }
  const write = (offset, value) => {
    const to = file(offset)
    mkdirSync(join(to, '..'), { recursive: true })
    writeFileSync(to + '.part', encoding.encode(value))
    renameSync(to + '.part', to)
    return offset
  }
  // An offset given under the lock: now, or the last given plus one. The
  // last is kept in the lock's file (else: the highest record there).
  const give = then => {
    mkdirSync(folder, { recursive: true })
    const at = join(folder, LOCK)
    const fd = openSync(at, 'a+')
    try {
      fsx.waitForLockSync(fd)
      const kept = Number(readFileSync(at, 'utf8'))
      const offset = Math.max(now(), (kept || (log.list({ limit: 1 })[0] ?? 0)) + 1)
      then(offset)
      writeFileSync(at, String(offset))
      return offset
    } finally { closeSync(fd) }
  }
  const log = {
    folder,
    buckets,
    fileOf: file,
    create: value => give(offset => write(offset, typeof value === 'function' ? value(offset) : value)),
    // an offset of this stream's with no record here: one clock for what
    // arrives beside it (an mrepo's own requests)
    reserve: () => give(() => {}),
    put: (offset, value) => write(offset, value),
    has: offset => existsSync(file(offset)),
    read: offset => encoding.decode(readFileSync(file(offset))),
    remove: offset => rmSync(file(offset), { force: true }),
    list ({ after = null, before = null, limit = Infinity, ascending = false } = {}) {
      const out = []
      for (const o of walk(folder, 0, ascending)) {
        if (out.length >= limit) break
        if (after !== null && o <= after) { if (ascending) continue; else break }
        if (before !== null && o >= before) { if (ascending) break; else continue }
        out.push(o)
      }
      return out
    }
  }
  return log
}
