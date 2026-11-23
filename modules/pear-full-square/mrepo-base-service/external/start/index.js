// start: service start /, the service state moved to started (README.md beside it).
import { transition } from '../../internal/state.js'

// log: in transition (../../internal/state.js): its hooks, the state moved
export const start = (exec, form) => transition(exec, 'start', 'started', 'started', form, 'initialised')
