import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'artifact' ? [react(), viteSingleFile()] : [react()],
  define: { __ARTIFACT__: JSON.stringify(mode === 'artifact') },
  build: { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', emptyOutDir: true },
  test: { globals: true, environment: 'jsdom' },
}))
