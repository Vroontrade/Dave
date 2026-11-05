import { useState } from 'react'
import { euro } from '../lib/money'

/** Eén reeks kolommen met optionele doellijn. Tik of hover op een kolom voor de waarde. */
export function Columns({ data, target, height = 150, tone = 'accent', label }: { data: { key: string; label: string; value: number }[]; target?: number; height?: number; tone?: 'accent' | 'success'; label: string }) {
  const [sel, setSel] = useState<number | null>(null)
  const maxV = Math.max(1, target ?? 0, ...data.map((d) => Math.abs(d.value)))
  const minV = Math.min(0, ...data.map((d) => d.value))
  const range = maxV - minV
  const W = 100 / Math.max(1, data.length)
  const y = (v: number) => ((maxV - v) / range) * height
  const color = tone === 'success' ? 'var(--success)' : 'var(--accent)'
  const shown = sel != null ? data[sel] : null
  return (
    <figure className="flex flex-col gap-2" aria-label={label}>
      <div className="flex h-5 items-baseline justify-between text-[13px]">
        <span className="text-muted">{shown ? shown.label : label}</span>
        <span className="num font-medium">{shown ? euro(shown.value) : target ? `Doel ${euro(target, { whole: true })}` : ''}</span>
      </div>
      <div className="relative" style={{ height }}>
        <svg width="100%" height={height} preserveAspectRatio="none" viewBox={`0 0 100 ${height}`} className="overflow-visible" role="img" aria-hidden>
          <line x1="0" x2="100" y1={y(0)} y2={y(0)} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => {
            const top = y(Math.max(0, d.value)), bottom = y(Math.min(0, d.value))
            const h = Math.max(d.value === 0 ? 0 : 1.5, bottom - top)
            return <rect key={d.key} x={i * W + W * 0.18} width={W * 0.64} y={d.value >= 0 ? y(0) - h : y(0)} height={h} rx="0.8" fill={d.value < 0 ? 'var(--warning)' : color} opacity={sel == null || sel === i ? 1 : 0.35} />
          })}
          {target != null && <line x1="0" x2="100" y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="absolute inset-0 flex">
          {data.map((d, i) => (
            <button key={d.key} type="button" className="h-full flex-1" aria-label={`${d.label}: ${euro(d.value)}`} onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)} />
          ))}
        </div>
      </div>
      <div className="flex text-[11px] text-muted">
        {data.map((d, i) => <span key={d.key} className={'flex-1 text-center ' + (data.length > 8 && i % 2 ? 'invisible' : '')}>{d.label.slice(0, 3)}</span>)}
      </div>
    </figure>
  )
}

/** Horizontale balken voor categorieën; tekst in inkt-kleuren, balk draagt de waarde. */
export function HBars({ data }: { data: { label: string; value: number; note?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  if (data.length === 0) return <p className="px-1 text-[14px] text-muted">Nog geen uitgaven in deze periode.</p>
  return (
    <div className="flex flex-col gap-3">
      {data.map((d) => (
        <div key={d.label} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-[14px]"><span className="truncate">{d.label}</span><span className="num">{euro(d.value)}</span></div>
          <div className="h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full bg-accent bar-fill" style={{ width: (d.value / max) * 100 + '%' }} /></div>
        </div>
      ))}
    </div>
  )
}

/** Lijn met vlak voor cumulatief spaarsaldo, plus doellijn. */
export function Area({ points, target, height = 140 }: { points: { label: string; value: number }[]; target: number; height?: number }) {
  const [sel, setSel] = useState<number | null>(null)
  if (points.length === 0) return null
  const max = Math.max(target, ...points.map((p) => p.value), 1)
  const n = points.length
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100)
  const y = (v: number) => height - (v / max) * (height - 6) - 1
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ')
  const area = `${line} L${x(n - 1)},${height} L${x(0)},${height} Z`
  const last = points[n - 1]
  const shown = sel != null ? points[sel] : last
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex justify-between text-[13px]"><span className="text-muted">{shown.label}</span><span className="num font-medium">{euro(shown.value)}</span></div>
      <div className="relative" style={{ height }}>
        <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" aria-hidden>
          <path d={area} fill="var(--success)" opacity="0.12" />
          <path d={line} fill="none" stroke="var(--success)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <line x1="0" x2="100" y1={y(target)} y2={y(target)} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {n === 1 && <rect x={x(0) - 1.2} y={y(last.value) - 4} width="2.4" height="8" rx="1.2" fill="var(--success)" />}
          {sel != null && <line x1={x(sel)} x2={x(sel)} y1="0" y2={height} stroke="var(--muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="absolute inset-0 flex">
          {points.map((p, i) => <button key={i} type="button" className="h-full flex-1" aria-label={`${p.label}: ${euro(p.value)}`} onClick={() => setSel(sel === i ? null : i)} onMouseEnter={() => setSel(i)} onMouseLeave={() => setSel(null)} />)}
        </div>
      </div>
      <div className="flex justify-between text-[11px] text-muted"><span>{points[0].label}</span><span>Doel {euro(target, { whole: true })}</span></div>
    </figure>
  )
}
