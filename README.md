# World-Wasm
World-Wasm 是用于浏览器和Node.js的 `WORLD Vocoder`  
支持同步和异步两种API

## 关于 WORLD Vocoder
[WORLD](https://github.com/mmorise/World/)是高质量语音分析、操作和合成系统。  
可以估计基频(F0)、频谱包络、非周期性指数，也可以仅使用估计参数合成语音。

## API
### 引入
```javascript
//npm install github:bolanxian/World-Wasm
import * as WORLD from 'world-wasm'
const wav = await (await fetch('./vaiueo2d.wav')).arrayBuffer()
```
### 同步API
```javascript
WORLD.create().then(world => {
  const { x, fs, nbit } = world.wavread(wav)
  const { f0: _f0, time_axis: t } = world.dio(x, fs)
  const f0 = world.stonemask(x, _f0, t, fs)
  const { spectrogram: sp, fft_size } = world.cheaptrick(x, f0, t, fs)
  const { aperiodicity: ap } = world.d4c(x, f0, t, fs)
  const y = world.synthesis(f0, sp, ap, fs)
  const wavy = world.wavwrite(y, fs)
})
```
### 异步API
```javascript
WORLD.createAsync().then(async (world) => {
  const { x, fs, nbit } = await world.wavread(wav)
  const { f0: _f0, time_axis: t } = await world.dio(x, fs)
  const f0 = await world.stonemask(x, _f0, t, fs)
  const { spectrogram: sp, fft_size } = await world.cheaptrick(x, f0, t, fs)
  const { aperiodicity: ap } = await world.d4c(x, f0, t, fs)
  const y = await world.synthesis(f0, sp, ap, fs)
  const wavy = await world.wavwrite(y, fs)
})
```