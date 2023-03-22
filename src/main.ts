
export {
  Ndarray, TypedArray,
  hasType, isTypedArray, isTypedArrayConstructor
} from './ndarray'
import type * as ndarray from './ndarray'
export type { ndarray }

import { getModule } from './loader'
import { World, createWorld } from './world'
import { WorldAsync, createWorldAsync } from './world-async'
export { getModule, World, WorldAsync }
export const create = async () => createWorld(await getModule())
export const createAsync = createWorldAsync
