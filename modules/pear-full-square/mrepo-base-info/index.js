// mrepo-base-info: its documented methods, a directory each (README.md beside each).
//   external/   the info protocol's actions: extract, get
//   internal/   info: a README read, the README rules, the info layer
//               from the packages' bundles
//   validate/   the tests every package carrying it runs on itself
export { get } from './external/get/index.js'
export { extractAction } from './external/extract/index.js'
export { parse, check, extract, keyword, packageKeyword, LAYER, TOP, MENU, INCLUDED, GENERATED } from './internal/info/index.js'
