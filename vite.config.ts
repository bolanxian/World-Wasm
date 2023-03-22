import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

// https://vitejs.dev/config/

export default defineConfig({
  base: './',
  build: {
    target: 'esnext',
    polyfillModulePreload: false,
    cssCodeSplit: false,
    minify: false,
    assetsDir: '.',
    assetsInlineLimit: 4096,
    lib: {
      entry: 'src/main.ts',
      formats: ['es']
    }
  },
  plugins: [
    dts({
      skipDiagnostics: true,
      rollupTypes: true
    })
  ]
})