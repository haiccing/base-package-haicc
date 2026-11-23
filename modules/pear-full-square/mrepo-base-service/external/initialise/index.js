// initialise: service initialise /, the service state moved to initialised (README.md beside it).
import { transition } from '../../internal/state.js'

// log: in transition (../../internal/state.js): its hooks, the state moved
export const initialise = (exec, form) => transition(exec, 'initialise', 'initialised', 'initialised', form, 'booted')
