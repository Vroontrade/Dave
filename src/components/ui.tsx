import { useEffect, type ReactNode } from 'react'
import { euro } from '../lib/money'
import type { Cents } from '../lib/money'
import { useStore } from '../store'

export function Money({ c, className = '', whole }: { c: Cents; className?: string; whole?: boolean }) {
  return <span className={'num ' + className}>{euro(c, { whole })}</span>
}

export function Bar({ value, max, tone = 'ink', className = '' }: { value: number; max: number; tone?: 'ink' | 'success' | 'warning'; className?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color = tone === 'success' ? 'bg-success' : tone === 'warning' ? 'bg-warning' : 'bg-accent'
  return (
    <div className={'h-1.5 w-full rounded-full bg-sunken overflow-hidden ' + className} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={'h-full rounded-full bar-fill ' + color} style={{ width: pct + '%' }} />
    </div>
  )
}

export function Section({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={'flex flex-col gap-3 ' + className}>
      {(title || action) && (
        <div className="flex items-baseline justify-between px-1">
          {title && <h2 className="label">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Row({ left, sub, right, rightSub, onClick, leading }: { left: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode; onClick?: () => void; leading?: ReactNode }) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{left}</div>
        {sub && <div className="truncate text-[13px] text-muted">{sub}</div>}
      </div>
      {(right || rightSub) && (
        <div className="text-right shrink-0">
          <div className="text-[15px] num">{right}</div>
          {rightSub && <div className="text-[12px] text-muted">{rightSub}</div>}
        </div>
      )}
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left min-h-[52px]'
  return onClick ? <button type="button" onClick={onClick} className={cls + ' active:bg-sunken transition-colors'}>{inner}</button> : <div className={cls}>{inner}</div>
}

export function List({ children }: { children: ReactNode }) {
  return <div className="panel divide-y divide-[color:var(--line)] overflow-hidden">{children}</div>
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-sunken p-1" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={'flex-1 rounded-[10px] py-2 text-[14px] font-medium transition-colors ' + (value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const v = {
    primary: 'bg-accent text-accent-ink',
    secondary: 'bg-sunken text-ink',
    ghost: 'text-ink',
    danger: 'bg-sunken text-danger',
  }[variant]
  return <button type={type} disabled={disabled} onClick={onClick} className={`min-h-[48px] rounded-2xl px-5 text-[15px] font-medium transition active:scale-[.98] disabled:opacity-40 ${v} ${className}`}>{children}</button>
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls = 'w-full rounded-xl bg-sunken px-3.5 py-3 text-[16px] outline-none border border-transparent focus:border-[color:var(--ink)]'

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/30 anim-fade" onClick={onClose} />
      <div className="relative w-full max-w-[520px] max-h-[92dvh] overflow-y-auto rounded-t-[24px] bg-bg anim-sheet gutter"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}>
        <div className="sticky top-0 z-10 -mx-4 bg-bg px-4 pt-2.5 pb-3">
          <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[color:var(--line)]" style={{ background: 'var(--muted)', opacity: .35 }} />
          <div className="flex items-center justify-between">
            <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full bg-sunken px-3 py-1.5 text-[14px]">Sluiten</button>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Toasts() {
  const { toasts, dismissToast } = useStore()
  return (
    <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 gutter" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }} aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'pointer-events-auto flex w-full max-w-[440px] items-center gap-3 rounded-2xl px-4 py-3 text-[14px] shadow-lg anim-rise ' + (t.tone === 'error' ? 'bg-danger text-white' : 'bg-accent text-accent-ink')}>
          <span className="flex-1">{t.text}</span>
          {t.undo && <button type="button" className="font-semibold underline underline-offset-2" onClick={() => { t.undo!(); dismissToast(t.id) }}>Ongedaan maken</button>}
        </div>
      ))}
    </div>
  )
}

export function Check({ on }: { on: boolean }) {
  return (
    <span className="check" data-on={on} aria-hidden>
      {on && <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7.4 5.8 10 11 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </span>
  )
}

export function Pill({ tone, children }: { tone: 'success' | 'warning' | 'muted'; children: ReactNode }) {
  const c = tone === 'success' ? 'bg-success-soft text-success' : tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-sunken text-muted'
  return <span className={'inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ' + c}>{children}</span>
}

export function PageHeader({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 pt-5 pb-1">
      <div>
        {eyebrow && <div className="label mb-1">{eyebrow}</div>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
      </div>
      {right}
    </header>
  )
}
