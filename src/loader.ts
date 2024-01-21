
import wasmUrl from '../deps/world.wasm?url'

let WASM: typeof WebAssembly
export let _wacs: typeof WebAssembly.compileStreaming
export let _wai: typeof WebAssembly.instantiate
export let isSupport: boolean
export const ready = (async () => {
  try {
    WASM = WebAssembly
    _wacs = WASM.compileStreaming
    _wai = WASM.instantiate
    WASM.Module.imports(await _wacs(fetch('data:application/wasm;base64,AGFzbQEAAAA')))
    isSupport = true
  } catch (e) {
    isSupport = false
    throw e
  }
})()

let modulePromise: Promise<WebAssembly.Module> | null
const getModuleStatic = () => modulePromise!
export let getModule = async () => {
  if (modulePromise == null) {
    await ready
    modulePromise = _wacs(fetch(wasmUrl))
  }
  try {
    const module = await modulePromise
    getModule = getModuleStatic
    return module
  } catch (e) {
    modulePromise = null
    throw e
  }
}
