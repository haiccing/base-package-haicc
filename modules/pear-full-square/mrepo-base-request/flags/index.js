// flags: the flags there are, a folder each (README.md beside each), each
// its declaration by its name. A folder not listed here fails the
// module's test; lib/flags.js reads the declarations and names no flag.
import log from './log/index.js'
import layer from './layer/index.js'
import container from './container/index.js'
import help from './help/index.js'
import feedback from './feedback/index.js'
import physical from './physical/index.js'

export const FLAGS = { log, layer, container, help, feedback, physical }
