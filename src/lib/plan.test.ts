import { describe, it, expect } from 'vitest'
import {
  HABITS, blocksFor, saveBlock, deleteBlock, resetDay, isTraining, weekTemplate, currentBlock, emptyPlan, habitRate, isValidPlan, nextInvestDay, pillarProgress, PILLARS,
  streak, toggleBlock, toggleHabit, trainingsThisWeek, weekStart, weekDays, type PlanData,
} from './plan'

const all = (p: PlanData, d: string, n = HABITS.length) => HABITS.slice(0, n).reduce((acc, h) => toggleHabit(acc, d, h.id), p)

describe('Persoonlijk plan', () => {
  it('startweek: werk, sport en avondblok; dinsdag school', () => {
    const p = emptyPlan()
    expect(blocksFor(p, '2027-01-04').map((b) => b.title)).toEqual(['Werk', 'Sporten', 'ION of school']) // maandag
    expect(blocksFor(p, '2027-01-05').map((b) => b.start)).toEqual(['09:30', '17:30', '19:30']) // dinsdag
    expect(blocksFor(p, '2027-01-10').map((b) => b.title)).toEqual(['ION-blok', 'Weekreview']) // zondag
  })

  it('blok aanpassen voor één dag of voor elke week', () => {
    let p = emptyPlan()
    const avond = blocksFor(p, '2027-01-04').find((b) => b.id === 'ma-avond')!
    p = saveBlock(p, '2027-01-04', { ...avond, title: 'School', cat: 'school' }, 'dag')
    expect(blocksFor(p, '2027-01-04').find((b) => b.id === 'ma-avond')!.title).toBe('School')
    expect(blocksFor(p, '2027-01-11').find((b) => b.id === 'ma-avond')!.title).toBe('ION of school') // volgende maandag niet
    p = resetDay(p, '2027-01-04')
    expect(blocksFor(p, '2027-01-04').find((b) => b.id === 'ma-avond')!.title).toBe('ION of school')
    p = saveBlock(p, '2027-01-04', { ...avond, start: '20:00' }, 'week')
    expect(blocksFor(p, '2027-01-11').find((b) => b.id === 'ma-avond')!.start).toBe('20:00')
    expect(weekTemplate(p)[2]).toEqual(weekTemplate(emptyPlan())[2]) // dinsdag ongemoeid
    p = deleteBlock(p, '2027-01-04', 'ma-sport', 'week')
    expect(blocksFor(p, '2027-01-18').some((b) => b.id === 'ma-sport')).toBe(false)
    p = saveBlock(p, '2027-01-06', { id: 'x1', start: '07:00', end: '07:30', title: 'Hardlopen', cat: 'sport' }, 'dag')
    expect(blocksFor(p, '2027-01-06')[0].title).toBe('Hardlopen') // gesorteerd op tijd
  })

  it('vindt het blok dat nu bezig is of als volgende komt', () => {
    const blocks = blocksFor(emptyPlan(), '2027-01-04')
    expect(currentBlock(blocks, '17:30')).toMatchObject({ state: 'now', block: { title: 'Sporten' } })
    expect(currentBlock(blocks, '18:45')).toMatchObject({ state: 'next', block: { title: 'ION of school' } })
    expect(currentBlock(blocks, '23:00')).toBeNull()
  })

  it('training afvinken telt ook als bewegen', () => {
    const kracht = blocksFor(emptyPlan(), '2027-01-04').find(isTraining)!
    const p = toggleBlock(emptyPlan(), '2027-01-04', kracht)
    expect(p.days['2027-01-04']).toEqual({ h: ['bewegen'], b: [kracht.id] })
    const off = toggleBlock(p, '2027-01-04', kracht)
    expect(off.days['2027-01-04'].b).toEqual([])
    expect(off.days['2027-01-04'].h).toEqual(['bewegen'])
  })

  it('telt trainingen in de week', () => {
    let p = emptyPlan()
    for (const d of weekDays('2027-01-06')) for (const b of blocksFor(p, d).filter(isTraining)) p = toggleBlock(p, d, b)
    expect(trainingsThisWeek(p, '2027-01-06')).toEqual({ done: 6, planned: 6 }) // ma t/m vr sporten + zaterdagloop
  })

  it('reeks telt dagen met minstens 5 van 7 gewoontes, ook als vandaag nog loopt', () => {
    let p = emptyPlan()
    p = all(p, '2027-01-03'); p = all(p, '2027-01-04', 5); p = all(p, '2027-01-05', 4)
    expect(streak(p, '2027-01-04')).toBe(2)
    expect(streak(p, '2027-01-05')).toBe(2) // vandaag 4 van 7: telt tot gisteren
    expect(streak(p, '2027-01-06')).toBe(0) // gisteren onder de 5: reeks voorbij
    p = all(emptyPlan(), '2027-01-04'); p = all(p, '2027-01-03')
    expect(streak(p, '2027-01-05')).toBe(2) // vandaag nog niets: telt tot gisteren
  })

  it('pijlers: handmatige waarde en gewoonte-percentage', () => {
    const lichaam = PILLARS.find((x) => x.id === 'lichaam')!
    expect(pillarProgress({ ...emptyPlan(), metrics: { lichaam: 5 } }, lichaam, '2027-01-10')).toEqual({ value: 0.5, label: '5 / 10 km' })
    let p = emptyPlan()
    for (let i = 1; i <= 15; i++) p = toggleHabit(p, `2027-01-${String(i).padStart(2, '0')}`, 'lezen')
    expect(habitRate(p, '2027-01-30', ['lezen'])).toBeCloseTo(0.5)
  })

  it('weekstart, volgende 25e en validatie', () => {
    expect(weekStart('2027-01-10')).toBe('2027-01-04')
    expect(weekStart('2027-01-04')).toBe('2027-01-04')
    expect(nextInvestDay('2026-11-19')).toBe('2026-11-25')
    expect(nextInvestDay('2026-12-26')).toBe('2027-01-25')
    expect(isValidPlan(emptyPlan())).toBe(true)
    expect(isValidPlan({ v: 2 })).toBe(false)
  })
})

import { encodeRestore, decodeRestore } from './storage'
import { emptyData } from './defaults'
describe('Herstellink', () => {
  it('codeert en leest een plan terug, ook met accenten', () => {
    const d = emptyData(new Date(2027, 0, 1))
    d.settings.items[0].name = 'Salaris € café'
    d.settings.setupDone = true
    const link = 'https://example.org/Dave/#herstel=' + encodeRestore(d)
    expect(decodeRestore(link)!.settings.items[0].name).toBe('Salaris € café')
    expect(decodeRestore('geen code hier!')).toBeNull()
    expect(() => decodeRestore('#herstel=abc')).toThrow()
  })
})
