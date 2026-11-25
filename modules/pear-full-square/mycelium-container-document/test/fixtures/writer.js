// A sender: records created in a streaming folder, each offset printed.
import * as json from 'mycelium-value-json'
import { stream } from '../../index.js'
const [folder, who, count] = Bare.argv.slice(2)
const log = stream(folder, json, { now: () => 1795312345678 })
for (let i = 0; i < Number(count); i++) console.log(log.create(offset => ({ who, i, offset })))
