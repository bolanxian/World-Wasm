
import { _wai } from './loader'
import { Ndarray, TypedArray, TypeNdarray } from './ndarray'

export type X = TypedArray<'float32' | 'float64'>
export type Y = TypedArray<'float64'>
export type TimeAxis = TypedArray<'float64'>
export type F0 = TypedArray<'float64'>
export type SP = TypeNdarray<2, 'float64'>
export type AP = TypeNdarray<2, 'float64'>
export interface WorldInterface {
  dio(x: X, fs: number, frame_period?: number, withStoneMask?: boolean): [F0, TimeAxis]
  harvest(x: X, fs: number, frame_period?: number, withStoneMask?: boolean): [F0, TimeAxis]
  stonemask(x: X, f0: F0, t: TimeAxis, fs: number): F0
  cheaptrick(x: X, f0: F0, t: TimeAxis, fs: number): SP
  d4c(x: X, f0: F0, t: TimeAxis, fs: number): AP
  wav2world(x: X, fs: number, frame_period?: number): [F0, SP, AP]
  synthesis(f0: F0, spectrogram: SP, aperiodicity: AP, fs: number, frame_period?: number): Y
}

const { min } = Math
const ERRNO_BADF = 8
const ERRNO_INVAL = 28
class WasiFile {
  #buffer: Uint8Array
  #pos: number = 0
  #size: number
  get buffer() { return this.#buffer }
  get pos() { return this.#pos }
  get size() { return this.#size }
  constructor(buffer: ArrayBufferLike | number) {
    if (typeof buffer === 'number') {
      this.#buffer = new Uint8Array(buffer)
      this.#size = 0
    } else {
      this.#buffer = new Uint8Array(buffer)
      this.#size = this.#buffer.byteLength
    }
  }
  #grow(newSize: number) {
    const oldSize = this.#buffer.length
    if (newSize > oldSize) {
      let size = oldSize
      if (size < 1) { size = 8 }
      do { size += min(size, 65536) } while (newSize > size)
      let buffer = this.#buffer
      this.#buffer = new Uint8Array(size)
      this.#buffer.set(buffer)
    }
  }
  read(iovs: Uint32Array) {
    let { buffer } = iovs
    let nread = 0, new_pos = this.#pos
    for (let i = 0, len = iovs.length; i < len; i += 2) {
      let iov_pos = iovs[i], iov_len = iovs[i + 1]
      let iov = new Uint8Array(buffer, iov_pos, iov_len)
      new_pos += iov_len
      if (new_pos > this.#size) {
        iov.set(new Uint8Array(this.#buffer.buffer, this.#pos, this.#size - this.#pos))
        nread += this.#size - this.#pos
        this.#pos = this.#size
        break
      }
      iov.set(new Uint8Array(this.#buffer.buffer, this.#pos, iov_len))
      this.#pos = new_pos
      nread += iov_len
    }
    return nread
  }
  write(iovs: Uint32Array) {
    let { buffer } = iovs
    let nwrite = 0, new_pos = this.#pos
    for (let i = 0, len = iovs.length; i < len; i += 2) {
      let iov_pos = iovs[i], iov_len = iovs[i + 1]
      new_pos += iov_len
      if (new_pos > this.#size) { this.#size = new_pos }
      this.#grow(new_pos)
      this.#buffer.set(new Uint8Array(buffer, iov_pos, iov_len), this.#pos)
      this.#pos = new_pos
      nwrite += iov_len
    }
    return nwrite
  }
  seek(offset: number, whence: number) {
    let new_offset: number
    switch (whence) {
      case 0://WHENCE_SET:
        new_offset = offset
        break;
      case 1://WHENCE_CUR:
        new_offset = this.#pos + offset
        break;
      case 2://WHENCE_END:
        new_offset = this.#size + offset
        break;
      default: return -1
    }
    if (new_offset >= 0) {
      this.#pos = new_offset
    }
    return new_offset
  }
  getData() {
    return new Uint8Array(this.#buffer.buffer, 0, this.#size)
  }
  getText() {
    return new TextDecoder().decode(new Uint8Array(this.#buffer.buffer, 0, this.#size))
  }
}

export let currentInstance: WebAssembly.Instance | null = null
let _createWorld: (module: WebAssembly.Module) => Promise<World>
export class World implements WorldInterface {
  static {
    _createWorld = async (module: WebAssembly.Module) => {
      const instance = await _wai(module, {
        wasi_snapshot_preview1: {
          fd_read(fd: number, iovs_ptr: number, iovs_len: number, nread_ptr: number): number {
            const file: WasiFile = that.#fds[fd]
            if (file == null) { return -ERRNO_BADF }
            let nread = file.read(new Uint32Array(buffer, iovs_ptr >>> 0, iovs_len * 2))
            new Uint32Array(buffer, nread_ptr, 1)[0] = nread
            return 0
          },
          fd_write(fd: number, iovs_ptr: number, iovs_len: number, nwritten_ptr: number): number {
            const file: WasiFile = that.#fds[fd]
            if (file == null) { return -ERRNO_BADF }
            let nwrite = file.write(new Uint32Array(buffer, iovs_ptr >>> 0, iovs_len * 2))
            new Uint32Array(buffer, nwritten_ptr, 1)[0] = nwrite
            return 0
          },
          fd_seek(fd: number, offset: bigint, whence: number, offset_out_ptr: number): number {
            const file: WasiFile = that.#fds[fd]
            if (file == null) { return -ERRNO_BADF }
            let new_offset = file.seek(Number(offset), whence)
            if (new_offset < 0) { return -ERRNO_INVAL }
            new BigUint64Array(buffer, offset_out_ptr >>> 0, 1)[0] = BigInt(new_offset)
            return 0
          },
          fd_close(fd: number): number {
            const file: WasiFile = that.#fds[fd]
            if (file == null) { return -ERRNO_BADF }
            that.#fds[fd].seek(0, 0)
            return 0
          },
          proc_exit(exit_code: number) { throw new Error('exit with exit code ' + exit_code) }
        },
        env: {
          readFloat64Array(fd: number, ptr: number, length: number) {
            new Float64Array(buffer, ptr >>> 0, length).set(that.#context[fd])
          },
          writeFloat64Array(fd: number, ptr: number, length: number) {
            const buf = that.#context[fd] = new Float64Array(+length)
            buf.set(new Float64Array(buffer, ptr >>> 0, length))
          },
          readFloat64Array2D(fd: number, ptr: number, x: number, y: number) {
            const ptrs = new Uint32Array(buffer, ptr >>> 0, x)
            const array = that.#context[fd]
            let i = 0; for (; i < x; i++) {
              new Float64Array(buffer, ptrs[i], y).set(array[i])
            }
          },
          writeFloat64Array2D(fd: number, ptr: number, x: number, y: number) {
            const ptrs = new Uint32Array(buffer, ptr >>> 0, x)
            const array = that.#context[fd] = Ndarray.create('float64', [x, y])
            let i = 0; for (; i < x; i++) {
              array[i].set(new Float64Array(buffer, ptrs[i], y))
            }
          },
          emscripten_notify_memory_growth(memory_index: number) {
            buffer = memory.buffer
          }
        }
      })
      const { memory } = instance.exports as any
      let buffer: ArrayBufferLike = memory.buffer
      currentInstance = instance
      const that = new World(instance)
      currentInstance = null
      return that
    }
  }
  #instance: WebAssembly.Instance
  #exports: any
  #context: any
  #fds: any
  constructor(instance: WebAssembly.Instance) {
    if (currentInstance !== instance) {
      throw new TypeError('Illegal constructor.')
    }
    this.#instance = instance
    this.#exports = instance.exports
    this.#context = null
    this.#fds = null
    this.#exports._initialize()
  }
  about(): string {
    try {
      this.#fds = [null, new WasiFile(8)]
      this.#exports._get_info()
      return this.#fds[1].getText().trim()
    } finally {
      this.#fds = null
    }
  }
  #init(fs: number, f0_floor: number = 0, f0_ceil: number = 0) {
    this.#exports._init_world(fs, f0_floor, f0_ceil)
  }
  dio(x: X, fs: number, frame_period: number = 5, withStoneMask: boolean = false): [F0, TimeAxis] {
    const context: any = this.#context = [x]
    this.#init(fs)
    this.#exports._dio(x.length, fs, frame_period, withStoneMask ? 1 : 0)
    this.#context = null
    return [context[2], context[1]]
  }
  harvest(x: X, fs: number, frame_period: number = 5, withStoneMask: boolean = false): [F0, TimeAxis] {
    const context: any = this.#context = [x]
    this.#init(fs)
    this.#exports._harvest(x.length, fs, frame_period, withStoneMask ? 1 : 0)
    this.#context = null
    return [context[2], context[1]]
  }
  stonemask(x: X, f0: F0, t: TimeAxis, fs: number): F0 {
    const context: any = this.#context = [x, t, f0]
    this.#exports._stonemask(x.length, fs, f0.length)
    this.#context = null
    return context[2]
  }
  cheaptrick(x: X, f0: F0, t: TimeAxis, fs: number): SP {
    const context: any = this.#context = [x, t, f0]
    this.#init(fs)
    this.#exports._cheaptrick(x.length, fs, f0.length)
    this.#context = null
    return context[3]
  }
  d4c(x: X, f0: F0, t: TimeAxis, fs: number): AP {
    const data: any = this.#context = [x, t, f0]
    this.#init(fs)
    this.#exports._d4c(x.length, fs, f0.length, 0)
    this.#context = null
    return data[4]
  }
  wav2world(x: X, fs: number, frame_period: number = 5): [F0, SP, AP] {
    const [_f0, t] = this.dio(x, fs, frame_period)
    const f0 = this.stonemask(x, _f0, t, fs)
    const sp = this.cheaptrick(x, f0, t, fs)
    const ap = this.d4c(x, f0, t, fs)
    return [f0, sp, ap]
  }
  synthesis(f0: F0, spectrogram: SP, aperiodicity: AP, fs: number, frame_period: number = 5): Y {
    const f0_length = f0.length
    if (f0_length != spectrogram.shape[0] || f0_length != aperiodicity.shape[0]) {
      throw new TypeError(`Mismatched number of frames between F0 (${f0_length}), ` +
        `spectrogram (${spectrogram.shape[0]}) and aperiodicty (${aperiodicity.shape[0]})`)
    }
    if (spectrogram.shape[1] != aperiodicity.shape[1]) {
      throw new TypeError(`Mismatched dimensionality (spec size) between ` +
        `spectrogram (${spectrogram.shape[1]}) and aperiodicity (${aperiodicity.shape[1]})`)
    }
    const context: any = this.#context = [null, null, f0, spectrogram, aperiodicity]
    this.#exports._synthesis(f0_length, (spectrogram.shape[1] - 1) * 2, fs, frame_period)
    this.#context = null
    return context[0]
  }
  wavread(wav: ArrayBufferLike): [X, number] {
    try {
      this.#context = [null]
      this.#fds = [
        null, new WasiFile(8),
        null, new WasiFile(wav)
      ]
      const x_length = this.#exports._wavreadlength()
      if (x_length > 0) {
        const fs = this.#exports._wavread(x_length)
        if (fs > 0) {
          return [this.#context[0], fs]
        }
      }
      throw new TypeError(this.#fds[1].getText().trim())
    } finally {
      this.#context = null
      this.#fds = null
    }
  }
  wavwrite(x: X, fs: number): Blob {
    try {
      this.#context = [x]
      this.#fds = [
        null, new WasiFile(8),
        null, new WasiFile(256)
      ]
      this.#exports._wavwrite(x.length, fs)
      const file: WasiFile = this.#fds[3]
      if (file.size > 0) {
        return new Blob([file.getData()], { type: 'audio/wave' })
      }
      throw new TypeError(this.#fds[1].getText().trim())
    } finally {
      this.#context = null
      this.#fds = null
    }
  }
}
export const createWorld = _createWorld