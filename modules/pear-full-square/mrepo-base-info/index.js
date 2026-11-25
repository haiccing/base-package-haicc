// mrepo-base-info: its documented methods, a directory each (README.md beside each).
//   external/   the info protocol's actions: extract, get, clear
//   internal/   info: a README read, the README rules, the info layer
//               from the packages' bundles
//   validate/   the tests every package carrying it runs on itself
export { get } from './external/get/index.js'
export { extractAction } from './external/extract/index.js'
export { clear } from './external/clear/index.js'
export { parse, check, extract, keyword, packageKeyword, packageKey, built, LAYER, TOP, MENU, INCLUDED, GENERATED, WANTED, STEPS, withSteps } from './internal/info/index.js'
