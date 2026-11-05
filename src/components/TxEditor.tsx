import { useEffect, useState } from 'react'
import type { Transaction, TxType } from '../lib/types'
import { addTransaction, deleteTransaction, updateTransaction, TX_LABEL } from '../lib/actions'
import { centsToInput, euro, parseAmount } from '../lib/money'
import { currentMonth, formatDate, monthLabel, monthOf, todayISO, addMonths } from '../lib/dates'
import { planForMonth } from '../lib/calc'
import { useStore } from '../store'
import { Button, Field, Sheet, inputCls } from './ui'

const TYPES: TxType[] = ['expense', 'income', 'savings_deposit', 'savings_withdrawal', 'reserve_deposit', 'reserve_expense', 'savings_opening', 'reserve_opening']

export interface TxPreset { type?: TxType; itemId?: string; amount?: number; note?: string; category?: string; month?: string }

export function TxEditor({ open, onClose, tx, preset }: { open: boolean; onClose: () => void; tx?: Transaction | null; preset?: TxPreset }) {
  const { data, commit } = useStore()
  const editing = !!tx
  const [type, setType] = useState<TxType>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [month, setMonth] = useState(currentMonth())
  const [itemId, setItemId] = useState('')
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(''); setConfirmDelete(false)
    if (tx) {
      setType(tx.type); setAmount(centsToInput(tx.amount)); setDate(tx.date); setMonth(tx.month); setItemId(tx.itemId ?? ''); setNote(tx.note); setCategory(tx.category)
    } else {
      setType(preset?.type ?? 'expense'); setAmount(preset?.amount ? centsToInput(preset.amount) : ''); setDate(todayISO()); setMonth(preset?.month ?? currentMonth())
      setItemId(preset?.itemId ?? ''); setNote(preset?.note ?? ''); setCategory(preset?.category ?? '')
    }
  }, [open, tx, preset])

  const plan = planForMonth(data, month)
  const expenseTargets = plan.items.filter((i) => i.kind === 'budget' || i.kind === 'bill')

  async function save() {
    const cents = parseAmount(amount)
    if (cents == null || cents <= 0) { setError('Vul een geldig bedrag in, bijvoorbeeld 45,50.'); return }
    const item = plan.items.find((i) => i.id === itemId)
    let ok: boolean
    if (editing && tx) {
      ok = await commit((d) => updateTransaction(d, tx.id, { amount: cents, date, note, category: category || tx.category, month }), { success: 'Wijziging opgeslagen' })
    } else {
      ok = await commit((d) => addTransaction(d, {
        type, amount: cents, date, month,
        itemId: type === 'expense' ? itemId || undefined : undefined,
        category: category || (item ? item.name : TX_LABEL[type]),
        note: note || (item ? item.name : ''),
        source: 'handmatig',
      }).data, { success: `${TX_LABEL[type]} van ${euro(cents)} opgeslagen`, undoable: true })
    }
    if (ok) onClose()
  }

  async function remove() {
    if (!tx) return
    const ok = await commit((d) => deleteTransaction(d, tx.id), { success: 'Verplaatst naar prullenbak', undoable: true })
    if (ok) onClose()
  }

  const monthOptions = Array.from({ length: 30 }, (_, i) => addMonths(currentMonth(), 12 - i)).filter((m) => m >= '2026-01')

  return (
    <Sheet open={open} onClose={onClose} title={editing ? 'Transactie aanpassen' : 'Transactie toevoegen'}>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <Field label="Soort">
          <select id="tx-type" className={inputCls} value={type} disabled={editing} onChange={(e) => setType(e.target.value as TxType)}>
            {TYPES.map((t) => <option key={t} value={t}>{TX_LABEL[t]}</option>)}
          </select>
        </Field>
        <Field label="Bedrag">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">€</span>
            <input id="tx-amount" className={inputCls + ' pl-8 num text-[20px] font-medium'} inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!editing} />
          </div>
        </Field>
        {type === 'expense' && !editing && (
          <Field label="Hoort bij" hint="Kies een budget of rekening, of laat het een vrije uitgave zijn.">
            <select id="tx-item" className={inputCls} value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Vrije uitgave</option>
              {expenseTargets.map((i) => <option key={i.id} value={i.id}>{i.kind === 'budget' ? 'Budget: ' : 'Rekening: '}{i.name}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Datum">
            <input id="tx-date" type="date" className={inputCls} value={date} onChange={(e) => { setDate(e.target.value); if (!editing && e.target.value) setMonth(monthOf(e.target.value)) }} />
          </Field>
          <Field label="Telt mee in">
            <select id="tx-month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)}>
              {monthOptions.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Omschrijving">
          <input id="tx-note" className={inputCls} value={note} maxLength={200} placeholder="Bijv. Shell A2" onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p className="text-[14px] text-danger" role="alert">{error}</p>}
        <Button type="submit">{editing ? 'Wijziging opslaan' : 'Opslaan'}</Button>
        {editing && tx && (
          <>
            {tx.history && tx.history.length > 0 && (
              <div className="rounded-xl bg-sunken p-3 text-[13px] text-muted">
                <div className="mb-1 font-medium text-ink">Eerdere versies</div>
                {tx.history.slice().reverse().map((h, i) => <div key={i} className="num">{formatDate(h.at.slice(0, 10), { year: true })}: {euro(h.amount)} op {formatDate(h.date)}</div>)}
              </div>
            )}
            {!confirmDelete
              ? <Button variant="danger" onClick={() => setConfirmDelete(true)}>Verwijderen</Button>
              : <div className="flex gap-2"><Button variant="secondary" className="flex-1" onClick={() => setConfirmDelete(false)}>Annuleren</Button><Button variant="danger" className="flex-1" onClick={() => void remove()}>Ja, verwijderen</Button></div>}
            <p className="text-center text-[12px] text-muted">Verwijderde transacties blijven in de prullenbak en zijn te herstellen.</p>
          </>
        )}
      </form>
    </Sheet>
  )
}
