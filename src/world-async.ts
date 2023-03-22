
import { getModule } from "./loader"
import { Ndarray } from "./ndarray"
import { TypedArray, TypeNdarray } from './ndarray'
import workerUrl from './worker?worker&url'

const workerFetch = (module: WebAssembly.Module, method: string, args: any[]) => new Promise<any>((ok, reject) => {
  const worker = new Worker(workerUrl, import.meta.env.DEV ? { type: 'module' } : void 0)
  worker.addEventListener('message', e => {
    const { data } = e
    if (data?.error != null) { reject(data.error) }
    else { ok(data) }
    worker.terminate()
  })
  worker.postMessage({ module, method, args })
})
let currentModule: WebAssembly.Module | null = null
export const createWorldAsync = async () => {
  const module = await getModule()
  currentModule = module
  const that = new WorldAsync(module)
  currentModule = null
  return that
}
export class WorldAsync {
  #module: WebAssembly.Module
  constructor(module: WebAssembly.Module) {
    if (currentModule !== module) {
      throw new TypeError('Illegal constructor.')
    }
    this.#module = module
  }
  dio(
    x: ArrayLike<number>, fs: number, frame_period: number = 5, withStoneMask: boolean = false
  ): Promise<[TypedArray<'float64'>, TypedArray<'float64'>]> {
    return workerFetch(this.#module, 'dio', [x, fs, frame_period, withStoneMask])
  }
  harvest(
    x: ArrayLike<number>, fs: number, frame_period: number = 5, withStoneMask: boolean = false
  ): Promise<[TypedArray<'float64'>, TypedArray<'float64'>]> {
    return workerFetch(this.#module, 'harvest', [x, fs, frame_period, withStoneMask])
  }
  stonemask(
    x: ArrayLike<number>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ): Promise<TypedArray<'float64'>> {
    return workerFetch(this.#module, 'stonemask', [x, f0, t, fs])
  }
  async cheaptrick(
    x: ArrayLike<number>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ) {
    const result = await workerFetch(this.#module, 'cheaptrick', [x, f0, t, fs])
    return Ndarray.unpack(result) as TypeNdarray<2, 'float64'>
  }
  async d4c(
    x: ArrayLike<number>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ) {
    const result = await workerFetch(this.#module, 'd4c', [x, f0, t, fs])
    return Ndarray.unpack(result) as TypeNdarray<2, 'float64'>
  }
  async wav2world(x: ArrayLike<number>, fs: number, frame_period: number = 5) {
    let [f0, sp, ap] = await workerFetch(this.#module, 'wav2world', [x, fs, frame_period])
    return [f0, Ndarray.unpack(sp), Ndarray.unpack(ap)] as [
      TypedArray<'float64'>, TypeNdarray<2, 'float64'>, TypeNdarray<2, 'float64'>
    ]
  }
  synthesis(
    f0: TypedArray<'float64'>,
    spectrogram: TypeNdarray<2, 'float64'>,
    aperiodicity: TypeNdarray<2, 'float64'>,
    fs: number, frame_period: number = 5
  ): Promise<TypedArray<'float64'>> {
    return workerFetch(this.#module, 'synthesis', [
      f0,
      Ndarray.pack(spectrogram),
      Ndarray.pack(aperiodicity),
      fs, frame_period
    ])
  }
}
