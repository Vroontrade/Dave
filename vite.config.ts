import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Elke versie (map) krijgt een eigen opslagsleutel, zodat gegevens nooit door elkaar lopen.
// Standaard 'financial-reset': daar staan Daves bestaande gegevens onder, niet wijzigen.
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'financial-reset'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'artifact' ? [react(), viteSingleFile()] : [react()],
  define: { __ARTIFACT__: JSON.stringify(mode === 'artifact'), __STORAGE_PREFIX__: JSON.stringify(STORAGE_PREFIX) },
  build: { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', emptyOutDir: true },
  test: { globals: true, environment: 'jsdom' },
}))
