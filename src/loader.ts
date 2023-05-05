
import wasmUrl from '../deps/world.wasm?url'
const WASM = typeof WebAssembly !== 'undefined' ? WebAssembly : {} as typeof WebAssembly
export const { compileStreaming: _wacs, instantiate: _wai, instantiateStreaming: _wais } = WASM
export let modulePromise: Promise<WebAssembly.Module>
export let getModule = async () => {
  if (modulePromise == null) {
    modulePromise = _wacs(fetch(wasmUrl))
  }
  getModule = () => modulePromise
  return modulePromise
}
