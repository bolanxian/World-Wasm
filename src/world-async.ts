
import { getModule } from './loader'
import { Ndarray } from './ndarray'
import type { World, WorldInterface, X, Y, TimeAxis, F0, SP, AP, DioResult, CheapTrickResult, D4CResult, WorldResult } from './world'
import workerUrl from './worker?worker&url'

export type WorldAsyncInterface = {
  [P in keyof WorldInterface]: WorldInterface[P] extends (...args: infer A) => infer R ? (...args: A) => Promise<R> : never
}

const run = <A extends unknown[], R>(
  module: WebAssembly.Module,
  functionToRun: (
    $: { Ndarray: typeof Ndarray, world: World }, args: [...A]
  ) => [R, Transferable[]?] | Promise<[R, Transferable[]?]>,
  args: [...A], options?: Transferable[]
) => new Promise<R>((ok, reject) => {
  const worker = new Worker(workerUrl, import.meta.env.DEV ? { type: 'module' } : void 0)
  worker.addEventListener('message', e => {
    try {
      const { data } = e, { error } = data
      if (error != null) {
        if (typeof error !== 'object') { reject(error); return }
        reject(error instanceof Error ? error : Object.assign(new Error(), error))
        return
      }
      ok(data)
    } catch (error) {
      reject(error)
    } finally {
      worker.terminate()
    }
  })
  const onerror = (cause: ErrorEvent | MessageEvent<any>) => {
    try {
      reject(new Error((cause as ErrorEvent).message || 'Unknown Error', { cause }))
    } catch (error) {
      reject(error)
    } finally {
      worker.terminate()
    }
  }
  worker.addEventListener('error', onerror)
  worker.addEventListener('messageerror', onerror)
  worker.postMessage({
    module, functionToRun: String(functionToRun), args
  }, options as Parameters<Worker["postMessage"]>[1])
})

let currentModule: WebAssembly.Module | null = null
export const createWorldAsync = async () => {
  const module = await getModule()
  currentModule = module
  const that = new WorldAsync(module)
  currentModule = null
  return that
}
export class WorldAsync implements WorldAsyncInterface {
  #module: WebAssembly.Module
  constructor(module: WebAssembly.Module) {
    if (currentModule !== module) {
      throw new TypeError('Illegal constructor.')
    }
    this.#module = module
  }
  fetch<A extends unknown[], R>(
    functionToRun: Parameters<typeof run<A, R>>[1], args: [...A], options?: Transferable[]
  ) {
    return run(this.#module, functionToRun, args, options)
  }
  dio(x: X, fs: number, frame_period?: number, withStoneMask?: boolean): Promise<DioResult> {
    return run(this.#module, ({ world }, args) => {
      let result = world.dio(...args)
      return [result, [result.f0.buffer, result.time_axis.buffer]]
    }, [x, fs, frame_period, withStoneMask])
  }
  harvest(x: X, fs: number, frame_period?: number, withStoneMask?: boolean): Promise<DioResult> {
    return run(this.#module, ({ world }, args) => {
      let result = world.harvest(...args)
      return [result, [result.f0.buffer, result.time_axis.buffer]]
    }, [x, fs, frame_period, withStoneMask])
  }
  stonemask(x: X, f0: F0, t: TimeAxis, fs: number): Promise<F0> {
    return run(this.#module, ({ world }, args) => {
      let result = world.stonemask(...args)
      return [result, [result.buffer]]
    }, [x, f0, t, fs])
  }
  async cheaptrick(x: X, f0: F0, t: TimeAxis, fs: number): Promise<CheapTrickResult> {
    const { spectrogram: sp, fft_size } = await run(this.#module, ({ Ndarray, world }, args) => {
      let { spectrogram: sp, fft_size } = world.cheaptrick(...args)
      let spectrogram = Ndarray.pack(sp)
      return [{ spectrogram, fft_size }, [spectrogram.buffer.buffer]]
    }, [x, f0, t, fs])
    return { spectrogram: Ndarray.unpack<SP>(sp), fft_size }
  }
  async d4c(x: X, f0: F0, t: TimeAxis, fs: number, fft_size?: number): Promise<D4CResult> {
    const { aperiodicity: ap } = await run(this.#module, ({ Ndarray, world }, args) => {
      let { aperiodicity: ap } = world.d4c(...args)
      let aperiodicity = Ndarray.pack(ap)
      return [{ aperiodicity }, [aperiodicity.buffer.buffer]]
    }, [x, f0, t, fs, fft_size])
    return { aperiodicity: Ndarray.unpack<AP>(ap) }
  }
  async wav2world(x: X, fs: number, frame_period?: number): Promise<WorldResult> {
    const [f0, time_axis, sp, ap, fft_size] = await run(this.#module, ({ Ndarray, world }, [x, fs, frame_period]) => {
      let { f0, time_axis, fft_size, spectrogram: sp, aperiodicity: ap } = world.wav2world(x, fs, frame_period)
      let spPacked = Ndarray.pack(sp), apPacked = Ndarray.pack(ap)
      return [[f0, time_axis, spPacked, apPacked, fft_size], [f0.buffer, spPacked.buffer.buffer, apPacked.buffer.buffer]]
    }, [x, fs, frame_period])
    return {
      f0, time_axis, fft_size,
      spectrogram: Ndarray.unpack<SP>(sp),
      aperiodicity: Ndarray.unpack<AP>(ap)
    }
  }
  synthesis(f0: F0, spectrogram: SP, aperiodicity: AP, fs: number, frame_period?: number): Promise<Y> {
    return run(this.#module, ({ Ndarray, world }, [f0, spPacked, apPacked, fs, frame_period]) => {
      let spectrogram = Ndarray.unpack<SP>(spPacked)
      let aperiodicity = Ndarray.unpack<AP>(apPacked)
      let result = world.synthesis(f0, spectrogram, aperiodicity, fs, frame_period)
      return [result, [result.buffer]]
    }, [f0, Ndarray.pack(spectrogram), Ndarray.pack(aperiodicity), fs, frame_period])
  }
  wavread(wav: ArrayBufferLike): Promise<{ x: X, fs: number, nbit: number }> {
    return run(this.#module, ({ world }, args) => {
      const result = world.wavread(...args)
      return [result, [result.x.buffer]]
    }, [wav])
  }
  wavwrite(x: X, fs: number): Promise<Blob> {
    return run(this.#module, ({ world }, args) => {
      const wav = world.wavwrite(...args)
      return [wav]
    }, [x, fs])
  }
}
