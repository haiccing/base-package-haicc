// stop: service stop /, the service state moved to initialised (README.md beside it).
import { transition } from '../../internal/state.js'

// log: in transition (../../internal/state.js): its hooks, the state moved
export const stop = (exec, form) => transition(exec, 'stop', 'initialised', 'stopped', form, 'started')
