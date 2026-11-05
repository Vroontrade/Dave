import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync, writeFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Elke versie (map) krijgt een eigen opslagsleutel, zodat gegevens nooit door elkaar lopen.
// Standaard 'financial-reset': daar staan Daves bestaande gegevens onder, niet wijzigen.
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'financial-reset'
// Optioneel: voornaam van de eigenaar van deze versie (alleen een naam, nooit bedragen).
const OWNER = process.env.OWNER || ''
// Optioneel: kleurpalet (map in brand/ met iconen + blok in src/index.css), bijv. mokka voor Sophie.
const PALETTE = process.env.PALETTE || ''
const APP_NAME = OWNER ? `Finance ${OWNER}` : 'Finance'

/** Zet de naam van deze versie in de paginatitel en het manifest (beginscherm-label blijft "Finance"). */
function versionName(): Plugin {
  let outDir = 'dist'
  return {
    name: 'finance-version-name',
    configResolved(c) { outDir = c.build.outDir },
    transformIndexHtml: (html) => {
      let out = html.replace('<title>Finance</title>', `<title>${APP_NAME}</title>`)
      if (PALETTE) out = out.replace('<html lang="nl">', `<html lang="nl" data-palette="${PALETTE}">`).replace('content="#121411"', 'content="#151210"')
      return out
    },
    closeBundle() {
      if (PALETTE) {
        const dir = join('brand', PALETTE)
        if (!existsSync(dir)) throw new Error(`Onbekend palet: ${PALETTE}`)
        for (const icon of readdirSync(dir)) copyFileSync(join(dir, icon), join(outDir, icon))
      }
      const f = join(outDir, 'manifest.webmanifest')
      if (!OWNER || !existsSync(f)) return
      const m = JSON.parse(readFileSync(f, 'utf8'))
      m.name = APP_NAME
      m.id = `finance-${OWNER.toLowerCase()}`
      writeFileSync(f, JSON.stringify(m, null, 2) + '\n')
    },
  }
}

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: mode === 'artifact' ? [react(), viteSingleFile()] : [react(), versionName()],
  define: { __ARTIFACT__: JSON.stringify(mode === 'artifact'), __STORAGE_PREFIX__: JSON.stringify(STORAGE_PREFIX), __OWNER__: JSON.stringify(OWNER) },
  build: { outDir: mode === 'artifact' ? 'dist-artifact' : 'dist', emptyOutDir: true },
  test: { globals: true, environment: 'jsdom' },
}))
