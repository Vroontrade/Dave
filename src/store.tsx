import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { AppData } from './lib/types'
import { emptyData } from './lib/defaults'
import { CloudStore, loadLocal, saveLocal, type StorageMode } from './lib/storage'
import { ActionError, ensureMonth } from './lib/actions'
import { currentMonth } from './lib/dates'

interface Toast { id: number; text: string; tone: 'ok' | 'error'; undo?: () => void }

interface StoreCtx {
  data: AppData
  ready: boolean
  mode: StorageMode
  syncing: boolean
  /** Voert een wijziging uit en slaat op. Resolves true pas als het echt is opgeslagen. */
  commit: (fn: (d: AppData) => AppData, opts?: { success?: string; undoable?: boolean }) => Promise<boolean>
  replaceAll: (d: AppData) => Promise<boolean>
  toast: (text: string, tone?: 'ok' | 'error', undo?: () => void) => void
  toasts: Toast[]
  dismissToast: (id: number) => void
}

const Ctx = createContext<StoreCtx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadLocal() ?? emptyData())
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<StorageMode>(() => (loadLocal() ? 'local' : 'memory'))
  const [syncing, setSyncing] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const cloud = useRef<CloudStore | null>(null)
  const dataRef = useRef(data)
  dataRef.current = data

  const toast = useCallback((text: string, tone: 'ok' | 'error' = 'ok', undo?: () => void) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone, undo }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), undo ? 6000 : 3200)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const persist = useCallback(async (next: AppData): Promise<boolean> => {
    const localOk = saveLocal(next)
    if (cloud.current) {
      setSyncing(true)
      try { await cloud.current.save(next); return true }
      catch { return localOk ? true : false }
      finally { setSyncing(false) }
    }
    return localOk
  }, [])

  // Opstarten: lokaal direct tonen, daarna Claude-account als bron van waarheid.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const store = await CloudStore.connect()
      if (!alive) return
      if (store) {
        try {
          const remote = await store.load()
          cloud.current = store
          setMode('cloud')
          if (remote) { setData(remote); saveLocal(remote) }
          else { await store.save(dataRef.current) } // eerste keer: lokale gegevens (of startplan) naar je account
        } catch {
          setMode(saveLocal(dataRef.current) ? 'local' : 'memory')
        }
      } else {
        setMode(saveLocal(dataRef.current) ? 'local' : 'memory')
      }
      // De lopende maand krijgt automatisch zijn vaste plan zodra hij begint.
      const m = currentMonth()
      if (!dataRef.current.months[m] && dataRef.current.settings.setupDone !== false) {
        const next = ensureMonth(dataRef.current, m)
        setData(next)
        await persist(next)
      }
      if (alive) setReady(true)
    })()
    return () => { alive = false }
  }, [persist])

  const commit = useCallback<StoreCtx['commit']>(async (fn, opts = {}) => {
    const prev = dataRef.current
    let next: AppData
    try { next = fn(prev) }
    catch (e) { toast(e instanceof ActionError ? e.message : 'Er ging iets mis. Er is niets gewijzigd.', 'error'); return false }
    setData(next)
    dataRef.current = next
    const ok = await persist(next)
    if (!ok) {
      setData(prev); dataRef.current = prev
      toast('Niet opgeslagen. Controleer je verbinding en probeer het opnieuw.', 'error')
      return false
    }
    if (opts.success) {
      toast(opts.success, 'ok', opts.undoable ? () => { void (async () => { if (dataRef.current !== next) { toast('Er is intussen iets anders gewijzigd. Pas het aan via Transacties.', 'error'); return } setData(prev); dataRef.current = prev; if (await persist(prev)) toast('Ongedaan gemaakt') })() } : undefined)
    }
    return true
  }, [persist, toast])

  const replaceAll = useCallback(async (d: AppData) => {
    const prev = dataRef.current
    setData(d); dataRef.current = d
    const ok = await persist(d)
    if (!ok) { setData(prev); dataRef.current = prev }
    return ok
  }, [persist])

  return <Ctx.Provider value={{ data, ready, mode, syncing, commit, replaceAll, toast, toasts, dismissToast }}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('StoreProvider ontbreekt')
  return c
}
