
import { getModule } from './loader'
import { Ndarray } from './ndarray'
import type { World, WorldInterface, X, Y, TimeAxis, F0, SP, AP } from './world'
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
    const { data } = e, error = data?.error
    error != null ? reject(new Error(error)) : ok(data)
    worker.terminate()
  })
  worker.addEventListener('error', reject)
  worker.addEventListener('messageerror', reject)
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
  dio(x: X, fs: number, frame_period: number = 5, withStoneMask: boolean = false): Promise<[F0, TimeAxis]> {
    return run(this.#module, ({ world }, [x, fs, frame_period, withStoneMask]) => {
      let result = world.dio(x, fs, frame_period, withStoneMask)
      return [result, Array.from(result, _ => _.buffer)]
    }, [x, fs, frame_period, withStoneMask])
  }
  harvest(x: X, fs: number, frame_period: number = 5, withStoneMask: boolean = false): Promise<[F0, TimeAxis]> {
    return run(this.#module, ({ world }, [x, fs, frame_period, withStoneMask]) => {
      let result = world.harvest(x, fs, frame_period, withStoneMask)
      return [result, Array.from(result, _ => _.buffer)]
    }, [x, fs, frame_period, withStoneMask])
  }
  stonemask(x: X, f0: F0, t: TimeAxis, fs: number): Promise<F0> {
    return run(this.#module, ({ world }, [x, f0, t, fs]) => {
      let result = world.stonemask(x, f0, t, fs)
      return [result, [result.buffer]]
    }, [x, f0, t, fs])
  }
  async cheaptrick(x: X, f0: F0, t: TimeAxis, fs: number): Promise<SP> {
    const result = await run(this.#module, ({ Ndarray, world }, [x, f0, t, fs]) => {
      let result = world.cheaptrick(x, f0, t, fs)
      let packed = Ndarray.pack(result)
      return [packed, [packed.buffer.buffer]]
    }, [x, f0, t, fs])
    return Ndarray.unpack<SP>(result)
  }
  async d4c(x: X, f0: F0, t: TimeAxis, fs: number): Promise<AP> {
    const result = await run(this.#module, ({ Ndarray, world }, [x, f0, t, fs]) => {
      let result = world.d4c(x, f0, t, fs)
      let packed = Ndarray.pack(result)
      return [packed, [packed.buffer.buffer]]
    }, [x, f0, t, fs])
    return Ndarray.unpack<AP>(result)
  }
  async wav2world(x: X, fs: number, frame_period: number = 5): Promise<[F0, SP, AP]> {
    let [f0, sp, ap] = await run(this.#module, ({ Ndarray, world }, [x, fs, frame_period]) => {
      let [f0, sp, ap] = world.wav2world(x, fs, frame_period)
      let spPacked = Ndarray.pack(sp), apPacked = Ndarray.pack(ap)
      return [[f0, spPacked, apPacked], [f0.buffer, spPacked.buffer.buffer, apPacked.buffer.buffer]]
    }, [x, fs, frame_period])
    return [f0, Ndarray.unpack<SP>(sp), Ndarray.unpack<AP>(ap)]
  }
  synthesis(f0: F0, spectrogram: SP, aperiodicity: AP, fs: number, frame_period: number = 5): Promise<Y> {
    return run(this.#module, ({ Ndarray, world }, [f0, spPacked, apPacked, fs, frame_period]) => {
      let spectrogram = Ndarray.unpack<SP>(spPacked)
      let aperiodicity = Ndarray.unpack<AP>(apPacked)
      let result = world.synthesis(f0, spectrogram, aperiodicity, fs, frame_period)
      return [result, [result.buffer]]
    }, [f0, Ndarray.pack(spectrogram), Ndarray.pack(aperiodicity), fs, frame_period])
  }
  wavread(wav: ArrayBufferLike): Promise<[X, number]> {
    return run(this.#module, ({ world }, [wav]) => {
      const [x, fs] = world.wavread(wav)
      return [[x, fs], [x.buffer]]
    }, [wav])
  }
  wavwrite(x: X, fs: number): Promise<Blob> {
    return run(this.#module, ({ world }, [x, fs]) => {
      const wav = world.wavwrite(x, fs)
      return [wav]
    }, [x, fs])
  }
}
