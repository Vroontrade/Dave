import { useEffect, useRef, useState } from 'react'
import { parseCommand, type ParseResult, type DraftAction } from '../lib/parser'
import { addTransaction, TX_LABEL } from '../lib/actions'
import { centsToInput, euro, parseAmount } from '../lib/money'
import { formatDate, monthLabel, monthOf } from '../lib/dates'
import { useStore } from '../store'
import { Button, Sheet, inputCls } from './ui'

const EXAMPLES = ['Mijn salaris is binnen', 'Ik heb €100 gespaard', 'Ik heb €40 getankt', 'Mijn zorgverzekering is betaald', 'De garage kostte €200', 'Hoeveel kan ik nog uitgeven?', 'Hoeveel heb ik dit jaar gespaard?', 'Wat staat er nog open?']

interface LogEntry { id: number; input: string; result: ParseResult; status?: 'saved' | 'cancelled' | 'failed'; savedText?: string }

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, commit } = useStore()
  const [text, setText] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [log])

  function submit(input: string) {
    const v = input.trim()
    if (!v) return
    setLog((l) => [...l.slice(-12), { id: Date.now(), input: v, result: parseCommand(v, data) }])
    setText('')
  }

  async function confirm(entry: LogEntry, d: DraftAction) {
    if (d.amount == null || d.amount <= 0) return
    const amount = d.amount
    const ok = await commit((state) => addTransaction(state, {
      type: d.type, amount, date: d.date, month: monthOf(d.date), itemId: d.itemId, category: d.category, note: d.note, source: 'assistent',
    }).data)
    setLog((l) => l.map((e) => (e.id === entry.id ? { ...e, result: d, status: ok ? 'saved' : 'failed', savedText: ok ? `Opgeslagen: ${TX_LABEL[d.type].toLowerCase()} van ${euro(amount)} op ${formatDate(d.date)}.` : undefined } : e)))
  }

  const cancel = (entry: LogEntry) => setLog((l) => l.map((e) => (e.id === entry.id ? { ...e, status: 'cancelled' } : e)))

  return (
    <Sheet open={open} onClose={onClose} title="Assistent">
      <div className="flex flex-col gap-4">
        {log.length === 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-[15px] text-muted">Vertel in gewone woorden wat er gebeurde of stel een vraag. Ik laat eerst zien wat ik ga opslaan; pas na jouw bevestiging wordt het bewaard.</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => submit(e)} className="rounded-full bg-surface px-3 py-2 text-[14px] shadow-sm active:bg-sunken">{e}</button>)}
            </div>
          </div>
        )}
        {log.map((e) => (
          <div key={e.id} className="flex flex-col gap-2 anim-rise">
            <div className="self-end max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[15px] text-accent-ink">{e.input}</div>
            <ResultCard entry={e} onConfirm={(d) => void confirm(e, d)} onCancel={() => cancel(e)} />
          </div>
        ))}
        <div ref={endRef} />
        <form className="sticky bottom-0 -mx-4 flex gap-2 bg-bg px-4 pt-2" onSubmit={(ev) => { ev.preventDefault(); submit(text) }}>
          <input id="assistant-input" className={inputCls + ' flex-1'} placeholder="Bijv. Ik heb €45 getankt" value={text} onChange={(ev) => setText(ev.target.value)} autoComplete="off" enterKeyHint="send" />
          <Button type="submit" disabled={!text.trim()}>Stuur</Button>
        </form>
      </div>
    </Sheet>
  )
}

function ResultCard({ entry, onConfirm, onCancel }: { entry: LogEntry; onConfirm: (d: DraftAction) => void; onCancel: () => void }) {
  const r = entry.result
  const [amount, setAmount] = useState(r.kind === 'action' && r.amount ? centsToInput(r.amount) : '')
  const [date, setDate] = useState(r.kind === 'action' ? r.date : '')
  const [fromReserve, setFromReserve] = useState(true)
  const [busy, setBusy] = useState(false)

  if (r.kind === 'unknown') return <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[15px] shadow-sm">{r.text}</div>
  if (r.kind === 'answer') {
    return (
      <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-surface px-3.5 py-3 text-[15px] shadow-sm">
        <p>{r.text}</p>
        {r.lines && <dl className="mt-2 flex flex-col gap-1 text-[14px]">{r.lines.map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="num">{v}</dd></div>)}</dl>}
      </div>
    )
  }
  if (entry.status === 'saved') return <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-success-soft px-3.5 py-2.5 text-[15px] text-success">{entry.savedText}</div>
  if (entry.status === 'cancelled') return <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2.5 text-[14px] text-muted">Geannuleerd. Er is niets opgeslagen.</div>

  const cents = parseAmount(amount)
  const final: DraftAction = r.canSwitchToBudget && !fromReserve
    ? { ...r, type: 'expense', category: 'Auto (uit budget)', amount: cents, date, explanation: '' }
    : { ...r, amount: cents, date }

  return (
    <div className="max-w-[94%] rounded-2xl rounded-bl-md bg-surface p-4 shadow-sm">
      <div className="label mb-1">Voorstel · nog niet opgeslagen</div>
      <div className="text-[17px] font-semibold">{r.title}</div>
      <p className="mt-1 text-[14px] text-muted">{r.canSwitchToBudget && !fromReserve ? 'Wordt afgetrokken van je vrij te besteden budget.' : r.explanation}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">€</span>
          <input aria-label="Bedrag" className={inputCls + ' pl-7 num'} inputMode="decimal" placeholder="Bedrag" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <input aria-label="Datum" type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      {date && <div className="mt-1.5 text-[12px] text-muted">Telt mee in {monthLabel(monthOf(date))}</div>}
      {r.canSwitchToBudget && (
        <div className="mt-3 flex rounded-xl bg-sunken p-1 text-[13px]">
          <button type="button" onClick={() => setFromReserve(true)} className={'flex-1 rounded-lg py-1.5 ' + (fromReserve ? 'bg-surface font-medium' : 'text-muted')}>Uit autoreserve</button>
          <button type="button" onClick={() => setFromReserve(false)} className={'flex-1 rounded-lg py-1.5 ' + (!fromReserve ? 'bg-surface font-medium' : 'text-muted')}>Uit lopend budget</button>
        </div>
      )}
      {entry.status === 'failed' && <p className="mt-2 text-[14px] text-danger">Niet opgeslagen. Probeer het opnieuw.</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onCancel}>Annuleren</Button>
        <Button className="flex-[2]" disabled={!cents || !date || busy} onClick={() => { setBusy(true); onConfirm(final); setTimeout(() => setBusy(false), 600) }}>
          {cents ? `Bevestig ${euro(cents)}` : 'Vul bedrag in'}
        </Button>
      </div>
    </div>
  )
}
