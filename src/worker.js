
import { Ndarray } from "./ndarray";
import { createWorld } from "./world";

self.addEventListener('message', async (e) => {
  try {
    const { data } = e
    const world = await createWorld(data.module)
    let [result, transfer] = {
      dio(x, fs, frame_period, withStoneMask) {
        const result = world.dio(x, fs, frame_period, withStoneMask)
        return [result, Array.from(result, _ => _.buffer)]
      },
      harvest(x, fs, frame_period, withStoneMask) {
        const result = world.harvest(x, fs, frame_period, withStoneMask)
        return [result, Array.from(result, _ => _.buffer)]
      },
      stonemask(x, f0, t, fs) {
        const result = world.stonemask(x, f0, t, fs)
        return [result, [result.buffer]]
      },
      cheaptrick(x, f0, t, fs) {
        let result = world.cheaptrick(x, f0, t, fs)
        const packed = Ndarray.pack(result)
        return [packed, [packed.buffer.buffer]]
      },
      d4c(x, f0, t, fs) {
        let result = world.d4c(x, f0, t, fs)
        const packed = Ndarray.pack(result)
        return [packed, [packed.buffer.buffer]]
      },
      wav2world(x, fs, frame_period) {
        let [f0, sp, ap] = world.wav2world(x, fs, frame_period)
        sp = Ndarray.pack(sp)
        ap = Ndarray.pack(ap)
        return [[f0, sp, ap], [f0.buffer, sp.buffer.buffer, ap.buffer.buffer]]
      },
      synthesis(f0, spectrogram, aperiodicity, fs, frame_period) {
        spectrogram = Ndarray.unpack(spectrogram)
        aperiodicity = Ndarray.unpack(aperiodicity)
        let result = world.synthesis(f0, spectrogram, aperiodicity, fs, frame_period)
        return [result, [result.buffer]]
      }
    }[data.method](...data.args)
    postMessage(result, transfer)
  } catch (error) {
    postMessage({ error: error?.message ?? 'error' })
  }
}, { once: !0 })
