
import { _wai } from './loader'
import { Ndarray, TypedArray, TypeNdarray } from './ndarray'
export let currentInstance: WebAssembly.Instance | null = null
let _createWorld: (module: WebAssembly.Module) => Promise<World>
export class World {
  static {
    _createWorld = async (module: WebAssembly.Module) => {
      const instance = await _wai(module, {
        wasi_snapshot_preview1: { proc_exit(code: number) { } },
        env: {
          readFloat64Array(fd: number, ptr: number, length: number) {
            new Float64Array(buffer, ptr >>> 0, length).set(that.#data[fd])
          },
          writeFloat64Array(fd: number, ptr: number, length: number) {
            const buf = that.#data[fd] = new Float64Array(+length)
            buf.set(new Float64Array(buffer, ptr >>> 0, length))
          },
          readFloat64Array2D(fd: number, ptr: number, x: number, y: number) {
            const ptrs = new Uint32Array(buffer, ptr >>> 0, x)
            const array = that.#data[fd]
            let i = 0; for (; i < x; i++) {
              new Float64Array(buffer, ptrs[i] >>> 0, y).set(array[i])
            }
          },
          writeFloat64Array2D(fd: number, ptr: number, x: number, y: number) {
            const ptrs = new Uint32Array(buffer, ptr >>> 0, x)
            const array = that.#data[fd] = Ndarray.create('float64', [x, y])
            let i = 0; for (; i < x; i++) {
              array[i].set(new Float64Array(buffer, ptrs[i] >>> 0, y))
            }
          },
          emscripten_notify_memory_growth: (size: number) => {
            buffer = memory.buffer
          }
        }
      })
      const { memory } = instance.exports as any
      let buffer: ArrayBuffer = memory.buffer
      currentInstance = instance
      const that = new World(instance)
      currentInstance = null
      return that
    }
  }
  #instance: WebAssembly.Instance
  #exports: any
  #data: any
  constructor(instance: WebAssembly.Instance) {
    if (currentInstance !== instance) {
      throw new TypeError('Illegal constructor.')
    }
    this.#instance = instance
    this.#exports = instance.exports
    this.#data = null
  }
  #init(fs: number, f0_floor: number = 0, f0_ceil: number = 0) {
    this.#exports._init(fs, f0_floor, f0_ceil)
  }
  dio(
    x: TypedArray<'float32' | 'float64'>, fs: number, frame_period: number = 5, withStoneMask: boolean = false
  ): [TypedArray<'float64'>, TypedArray<'float64'>] {
    const data: any = this.#data = [x]
    this.#init(fs)
    this.#exports._dio(x.length, fs, frame_period, withStoneMask ? 1 : 0)
    this.#data = null
    return [data[2], data[1]]
  }
  harvest(
    x: TypedArray<'float32' | 'float64'>, fs: number, frame_period: number = 5, withStoneMask: boolean = false
  ): [TypedArray<'float64'>, TypedArray<'float64'>] {
    const data: any = this.#data = [x]
    this.#init(fs)
    this.#exports._harvest(x.length, fs, frame_period, withStoneMask ? 1 : 0)
    this.#data = null
    return [data[2], data[1]]
  }
  stonemask(
    x: TypedArray<'float32' | 'float64'>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ): TypedArray<'float64'> {
    const data: any = this.#data = [x, t, f0]
    this.#exports._stonemask(x.length, fs, f0.length)
    this.#data = null
    return data[2]
  }
  cheaptrick(
    x: TypedArray<'float32' | 'float64'>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ): TypeNdarray<2, 'float64'> {
    const data: any = this.#data = [x, t, f0]
    this.#init(fs)
    this.#exports._cheaptrick(x.length, fs, f0.length)
    this.#data = null
    return data[3]
  }
  d4c(
    x: TypedArray<'float32' | 'float64'>, f0: TypedArray<'float64'>, t: TypedArray<'float64'>, fs: number
  ): TypeNdarray<2, 'float64'> {
    const data: any = this.#data = [x, t, f0]
    this.#init(fs)
    this.#exports._d4c(x.length, fs, f0.length, 0)
    this.#data = null
    return data[4]
  }
  wav2world(x: TypedArray<'float32' | 'float64'>, fs: number, frame_period: number = 5): [
    TypedArray<'float64'>, TypeNdarray<2, 'float64'>, TypeNdarray<2, 'float64'>
  ] {
    const [_f0, t] = this.dio(x, fs, frame_period)
    const f0 = this.stonemask(x, _f0, t, fs)
    const sp = this.cheaptrick(x, f0, t, fs)
    const ap = this.d4c(x, f0, t, fs)
    return [f0, sp, ap]
  }
  synthesis(
    f0: TypedArray<'float64'>,
    spectrogram: TypeNdarray<2, 'float64'>,
    aperiodicity: TypeNdarray<2, 'float64'>,
    fs: number, frame_period: number = 5
  ): TypedArray<'float64'> {
    const f0_length = f0.length
    if (f0_length != spectrogram.shape[0] || f0_length != aperiodicity.shape[0]) {
      throw new TypeError(`Mismatched number of frames between F0 (${f0_length}), ` +
        `spectrogram (${spectrogram.shape[0]}) and aperiodicty (${aperiodicity.shape[0]})`)
    }
    if (spectrogram.shape[1] != aperiodicity.shape[1]) {
      throw new TypeError(`Mismatched dimensionality (spec size) between ` +
        `spectrogram (${spectrogram.shape[1]}) and aperiodicity (${aperiodicity.shape[1]})`)
    }
    const data: any = this.#data = [null, null, f0, spectrogram, aperiodicity]
    this.#exports._synthesis(f0_length, (spectrogram.shape[1] - 1) * 2, fs, frame_period)
    this.#data = null
    return data[0]
  }
}
export const createWorld = _createWorld