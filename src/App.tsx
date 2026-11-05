import { useEffect, useState, type ReactNode } from 'react'
import { StoreProvider, useStore } from './store'
import { Dashboard } from './pages/Dashboard'
import { MonthPage } from './pages/Month'
import { SavingsPage } from './pages/Savings'
import { TransactionsPage } from './pages/Transactions'
import { SettingsPage } from './pages/Settings'
import { Assistant } from './components/Assistant'
import { Setup } from './pages/Setup'
import { Toasts } from './components/ui'
import { dueReminders } from './lib/reminders'

export type Tab = 'dashboard' | 'maand' | 'sparen' | 'transacties' | 'instellingen'
const TABS: Tab[] = ['dashboard', 'maand', 'sparen', 'transacties', 'instellingen']

const Icon = ({ d }: { d: ReactNode }) => <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
const NAV: { tab: Tab; label: string; icon: ReactNode }[] = [
  { tab: 'dashboard', label: 'Dashboard', icon: <Icon d={<><path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>} /> },
  { tab: 'maand', label: 'Maand', icon: <Icon d={<><rect x="4" y="5" width="16" height="15" rx="2.5" /><path d="M8 3v4M16 3v4M4 10h16M8.5 14.5l2 2 4-4" /></>} /> },
  { tab: 'sparen', label: 'Sparen', icon: <Icon d={<><path d="M12 20V10M12 10l-4 4M12 10l4 4" /><path d="M5 5h14" /></>} /> },
  { tab: 'transacties', label: 'Transacties', icon: <Icon d={<><path d="M5 7h14M5 12h14M5 17h9" /></>} /> },
  { tab: 'instellingen', label: 'Instellingen', icon: <Icon d={<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" /></>} /> },
]

function readHash(): Tab {
  const h = (typeof location !== 'undefined' ? location.hash.slice(1) : '') as Tab
  return TABS.includes(h) ? h : 'dashboard'
}

function useNotifications() {
  const { data, ready } = useStore()
  useEffect(() => {
    if (!ready || !data.settings.notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const run = async () => {
      let seen: string[] = []
      try { seen = JSON.parse(localStorage.getItem('financial-reset:notified') || '[]') } catch { /* leeg */ }
      const fresh = dueReminders(data).filter((r) => !seen.includes(r.key))
      if (!fresh.length) return
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
        for (const r of fresh) {
          if (reg) await reg.showNotification(r.title, { body: r.body, tag: r.key, icon: './icon-192.png' })
          else new Notification(r.title, { body: r.body, tag: r.key })
        }
        localStorage.setItem('financial-reset:notified', JSON.stringify([...seen, ...fresh.map((r) => r.key)].slice(-200)))
      } catch { /* meldingen niet beschikbaar; de banner op het dashboard blijft werken */ }
    }
    void run()
    const onVis = () => document.visibilityState === 'visible' && void run()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [data, ready])
}

function Shell() {
  const [tab, setTab] = useState<Tab>(readHash)
  const [assistant, setAssistant] = useState(false)
  const { ready, mode, syncing, data } = useStore()
  useNotifications()

  useEffect(() => {
    const on = () => setTab(readHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (t: Tab) => {
    setTab(t)
    try { history.replaceState(null, '', '#' + t) } catch { location.hash = t }
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto min-h-full max-w-[520px]">
      <Toasts />
      <main className="gutter flex flex-col gap-6" style={{ paddingBottom: 'calc(150px + env(safe-area-inset-bottom, 0px))' }}>
        {!ready && <div className="pt-4 text-[13px] text-muted">Gegevens laden…</div>}
        {mode === 'memory' && ready && <div className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[13px] text-warning">Opslag is hier niet beschikbaar. Wijzigingen worden niet bewaard.</div>}
        {data.settings.setupDone === false ? (ready ? <Setup /> : null) : <div key={tab} className="anim-rise">
          {tab === 'dashboard' && <Dashboard go={go} openAssistant={() => setAssistant(true)} />}
          {tab === 'maand' && <MonthPage />}
          {tab === 'sparen' && <SavingsPage />}
          {tab === 'transacties' && <TransactionsPage />}
          {tab === 'instellingen' && <SettingsPage />}
        </div>}
      </main>

      {/* Assistent-knop, binnen bereik van je duim */}
      {data.settings.setupDone !== false && <><button type="button" onClick={() => setAssistant(true)} aria-label="Assistent openen"
        className="fixed z-30 flex items-center gap-2 rounded-full bg-accent py-3 pl-4 pr-5 text-[15px] font-medium text-accent-ink shadow-lg transition active:scale-95"
        style={{ right: 'max(16px, calc(env(safe-area-inset-right, 0px) + 16px))', bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        Meld iets
      </button>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t hair bg-[color:var(--bg)]/90 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: 'color-mix(in srgb, var(--bg) 88%, transparent)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }} aria-label="Hoofdmenu">
        <div className="mx-auto flex max-w-[520px]">
          {NAV.map((n) => (
            <button key={n.tab} type="button" onClick={() => go(n.tab)} aria-current={tab === n.tab ? 'page' : undefined}
              className={'flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10.5px] font-medium transition-colors ' + (tab === n.tab ? 'text-ink' : 'text-muted')}>
              {n.icon}
              {n.label}
            </button>
          ))}
        </div>
        {syncing && <span className="absolute right-3 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-success" aria-label="Bezig met opslaan" />}
      </nav></>}
      <Assistant open={assistant} onClose={() => setAssistant(false)} />
    </div>
  )
}

export default function App() {
  return <StoreProvider><Shell /></StoreProvider>
}
