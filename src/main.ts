
export {
  Ndarray, TypedArray,
  hasType, isTypedArray, isTypedArrayConstructor
} from './ndarray'
import type * as ndarray from './ndarray'
export type { ndarray }

import { getModule } from './loader'
import {
  World, createWorld, WorldInterface,
  X, Y, TimeAxis, F0, SP, AP,
  DioResult, CheapTrickResult, D4CResult, WorldResult
} from './world'
import { WorldAsync, createWorldAsync, WorldAsyncInterface } from './world-async'

export { getModule, World, WorldAsync }
export type {
  WorldInterface, WorldAsyncInterface,
  X, Y, TimeAxis, F0, SP, AP,
  DioResult, CheapTrickResult, D4CResult, WorldResult
}
export const create = async () => createWorld(await getModule())
export const createAsync = createWorldAsync
export {
  create as createWorld,
  createWorldAsync
}