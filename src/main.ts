
export { Ndarray } from './ndarray'
import * as ndarray from './ndarray'
export { ndarray }

import { getModule } from './loader'
import { World, createWorld, WorldInterface } from './world'
import { WorldAsync, createWorldAsync, WorldAsyncInterface } from './world-async'

export type { WorldInterface, WorldAsyncInterface }
export type {
  X, Y, TimeAxis, F0, SP, AP,
  DioResult, CheapTrickResult, D4CResult, WorldResult
} from './world'
export const create = async () => createWorld(await getModule())
export const createAsync = createWorldAsync
export { getModule, World, WorldAsync }
export { create as createWorld, createWorldAsync }