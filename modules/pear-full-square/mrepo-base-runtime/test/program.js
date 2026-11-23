// A program as runtime/start starts one, for the tests: it writes its
// state, removes it as it ends, ends on SIGTERM.
import process from 'bare-process'
import { writeFileSync, renameSync, rmSync } from 'bare-fs'

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const state = arg('state')
writeFileSync(`${state}.new`, JSON.stringify({ pid: process.pid, dir: arg('dir'), runtime: Number(arg('runtime')) }))
renameSync(`${state}.new`, state)
const t = setInterval(() => {}, 1000)
process.on('SIGTERM', () => { rmSync(state, { force: true }); clearInterval(t) })
