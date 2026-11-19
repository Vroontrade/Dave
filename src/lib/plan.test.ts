import { describe, it, expect } from 'vitest'
import {
  HABITS, autoPhase, blocksFor, currentBlock, emptyPlan, habitRate, isValidPlan, nextInvestDay, pillarProgress, PILLARS,
  streak, toggleBlock, toggleHabit, trainingsThisWeek, weekStart, weekDays, type PlanData,
} from './plan'

const all = (p: PlanData, d: string, n = HABITS.length) => HABITS.slice(0, n).reduce((acc, h) => toggleHabit(acc, d, h.id), p)

describe('Persoonlijk plan', () => {
  it('kiest automatisch de juiste fase', () => {
    expect(autoPhase('2026-11-19')).toBe('fase1')
    expect(autoPhase('2027-01-01')).toBe('fase2')
    expect(autoPhase('2027-06-30')).toBe('fase2')
    expect(autoPhase('2027-07-01')).toBe('fase3')
  })

  it('geeft de standaardweek per dag, op tijd gesorteerd', () => {
    const p = emptyPlan()
    expect(blocksFor(p, '2027-01-04').map((b) => b.title)).toEqual(['Werk', 'Kracht', 'School']) // maandag
    expect(blocksFor(p, '2027-01-05').map((b) => b.start)).toEqual(['07:00', '09:20', '20:00']) // dinsdag
    expect(blocksFor(p, '2027-01-10').map((b) => b.title)).toEqual(['ION-blok', 'Weekreview']) // zondag
    expect(blocksFor({ ...p, phase: 'fase3' }, '2026-11-20').some((b) => b.title === 'Vrije avond')).toBe(true) // vrijdag na opleiding
  })

  it('vindt het blok dat nu bezig is of als volgende komt', () => {
    const blocks = blocksFor(emptyPlan(), '2027-01-04')
    expect(currentBlock(blocks, '17:30')).toMatchObject({ state: 'now', block: { title: 'Kracht' } })
    expect(currentBlock(blocks, '18:45')).toMatchObject({ state: 'next', block: { title: 'School' } })
    expect(currentBlock(blocks, '23:00')).toBeNull()
  })

  it('training afvinken telt ook als bewegen', () => {
    const kracht = blocksFor(emptyPlan(), '2027-01-04').find((b) => b.training)!
    const p = toggleBlock(emptyPlan(), '2027-01-04', kracht)
    expect(p.days['2027-01-04']).toEqual({ h: ['bewegen'], b: [kracht.id] })
    const off = toggleBlock(p, '2027-01-04', kracht)
    expect(off.days['2027-01-04'].b).toEqual([])
    expect(off.days['2027-01-04'].h).toEqual(['bewegen'])
  })

  it('telt trainingen in de week', () => {
    let p = emptyPlan()
    for (const d of weekDays('2027-01-06')) for (const b of blocksFor(p, d).filter((x) => x.training)) p = toggleBlock(p, d, b)
    expect(trainingsThisWeek(p, '2027-01-06')).toEqual({ done: 5, planned: 5 }) // 3× kracht + 2× hardlopen
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
