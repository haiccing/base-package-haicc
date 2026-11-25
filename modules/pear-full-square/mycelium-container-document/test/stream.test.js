import test from 'brittle'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'bare-fs'
import { join } from 'bare-path'
import { tmpdir } from 'bare-os'
import { spawn } from 'bare-subprocess'
import { fileURLToPath } from 'bare-url'
import * as json from 'mycelium-value-json'
import { stream, placeOf, bucketsOf, nameOf, isOffset, BUCKETS } from '../index.js'

const fresh = () => mkdtempSync(join(tmpdir(), 'stream-'))

test('stream: a record\'s name is its offset, the time it arrived, in milliseconds', (t) => {
  const dir = fresh()
  try {
    const log = stream(join(dir, 'done'), json)
    const before = Date.now()
    const a = log.create({ n: 1 })
    t.ok(Number.isInteger(a) && a >= before && a <= Date.now() + 1, 'a number, now')
    t.ok(isOffset(nameOf(a)), '13 digits')
    t.alike(log.read(a), { n: 1 })
    t.ok(log.has(a))
    const b = log.create(offset => ({ offset, n: 2 }))
    t.is(log.read(b).offset, b, 'a record that says its own offset')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('stream: offsets only grow, never two the same: an offset taken, the next one', (t) => {
  const dir = fresh()
  try {
    const at = 1795312345678
    const log = stream(join(dir, 's'), json, { now: () => at })
    const made = [log.create({}), log.create({}), log.create({})]
    t.alike(made, [at, at + 1, at + 2], 'the same millisecond: plus one')
    const back = stream(join(dir, 's'), json, { now: () => at - 5000 })
    t.is(back.create({}), at + 3, 'a clock gone back: after the highest there')
    t.is(back.reserve(), at + 4, 'an offset reserved: given, no record written')
    t.absent(back.has(at + 4))
    t.is(back.create({}), at + 5, 'and never given again')
    rmSync(join(dir, 's', '.lock'))
    t.is(back.create({}), at + 6, 'its lock file gone: after the highest record there')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('stream: kept in buckets, two levels, each folder a prefix of the offset', (t) => {
  const dir = fresh()
  try {
    t.alike(BUCKETS, [5, 6], 'the default: about 28 hours, about 2.8')
    t.alike(bucketsOf(1795312345678), ['17953', '179531'])
    t.is(placeOf(1795312345678), '17953/179531/1795312345678')
    const log = stream(join(dir, 's'), json)
    log.put(1795312345678, { n: 1 })
    log.put(1795399999999, { n: 2 })
    log.put(1795400000000, { n: 3 })
    t.alike(readdirSync(join(dir, 's')).sort(), ['17953', '17954'])
    t.alike(readdirSync(join(dir, 's', '17953')).sort(), ['179531', '179539'])
    t.alike(readdirSync(join(dir, 's', '17953', '179531')), ['1795312345678.json'], 'no temporary file left')
    t.alike(log.read(1795399999999), { n: 2 }, 'read by its offset alone')
    const wide = stream(join(dir, 'w'), json, { buckets: [5, 7] })
    wide.put(1795312345678, {})
    t.ok(existsSync(join(dir, 'w', '17953', '1795312', '1795312345678.json')), 'the levels a folder declares')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('stream: listed in the natural order, the newest first; after, before, limit', (t) => {
  const dir = fresh()
  try {
    const log = stream(join(dir, 's'), json)
    const all = [1795312345678, 1795312345679, 1795399999999, 1795400000000, 1805400000000]
    for (const o of all) log.put(o, { o })
    t.alike(log.list(), [...all].reverse(), 'descending, across buckets')
    t.alike(log.list({ ascending: true }), all)
    t.alike(log.list({ limit: 2 }), [1805400000000, 1795400000000], 'the newest two')
    t.alike(log.list({ after: 1795399999999 }), [1805400000000, 1795400000000])
    t.alike(log.list({ after: 1795312345678, ascending: true, limit: 1 }), [1795312345679], 'the next after a pointer')
    t.alike(log.list({ before: 1795312345679 }), [1795312345678])
    log.remove(1795400000000)
    t.absent(log.list().includes(1795400000000))
    t.alike(stream(join(dir, 'none'), json).list(), [], 'no folder yet: none')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('stream: senders in parallel, each its own process: every record its own offset, none lost', async (t) => {
  const dir = fresh()
  try {
    const folder = join(dir, 's')
    const each = 40
    const writer = fileURLToPath(new URL('./fixtures/writer.js', import.meta.url))
    const runs = await Promise.all([0, 1, 2, 3].map(w => new Promise(resolve => {
      const p = spawn(Bare.argv[0], [writer, folder, String(w), String(each)], { stdio: ['ignore', 'pipe', 'inherit'] })
      let out = ''
      p.stdout.on('data', d => { out += d })
      p.on('exit', code => resolve({ code, offsets: out.trim().split('\n').map(Number) }))
    })))
    t.alike(runs.map(r => r.code), [0, 0, 0, 0])
    const given = runs.flatMap(r => r.offsets)
    t.is(new Set(given).size, 4 * each, 'no offset given twice')
    const log = stream(folder, json)
    t.alike(log.list({ ascending: true }), [...given].sort((a, b) => a - b), 'every record there, under the offset its sender was given')
    for (const r of runs) t.alike([...r.offsets].sort((a, b) => a - b), r.offsets, 'a sender\'s own: in the order sent')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
