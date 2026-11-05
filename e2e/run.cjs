// End-to-end controle in een echte browser (iPhone-formaat) met neutrale voorbeeldbedragen.
const { chromium, devices } = require('playwright')
const OUT = process.argv[2]
const URL = 'http://localhost:4173/'
const assert = (c, m) => { if (!c) { console.error('FOUT: ' + m); process.exitCode = 1 } else console.log('OK  ' + m) }
;(async () => {
  const b = await chromium.launch()
  const ctx = await b.newContext({ ...devices['iPhone 13'] })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', (e) => errors.push(String(e)))
  const body = async () => (await p.textContent('body')).replace(/ /g, ' ')

  // 1. Eerste gebruik: instelscherm
  await p.goto(URL + '#dashboard')
  await p.waitForSelector('text=Stel je maandplan in')
  await p.screenshot({ path: OUT + '/0-instellen.png', fullPage: true })
  await p.fill('#setup-income', '2500')
  await p.fill('#setup-day', '25')
  const names = p.locator('input[aria-label="Naam"]')
  await names.nth(0).fill('Zorgverzekering'); await p.locator('[id^="setup-row-"]').nth(0).fill('140')
  await names.nth(1).fill('Telefoon'); await p.locator('[id^="setup-row-"]').nth(1).fill('40')
  await names.nth(2).fill('Brandstof'); await p.locator('[id^="setup-row-"]').nth(2).fill('200')
  await p.fill('#setup-savings', '600')
  await p.fill('#setup-reserve', '100')
  await p.fill('#setup-target', '10000')
  assert((await body()).includes('€ 1.420,00'), 'Instelscherm rekent vrij budget live uit (€1.420)')
  await p.click('button:has-text("Plan opslaan en beginnen")')
  await p.waitForSelector('text=Nog vrij te besteden')
  let t = await body()
  assert(t.includes('€ 1.420,00') && t.includes('€ 380,00'), 'Dashboard toont eigen plan')

  // 2. Afvinken + herladen
  await p.click('nav >> text=Maand')
  await p.click('button[aria-label="Afvinken: Zorgverzekering"]')
  await p.waitForSelector('button[aria-label="Ongedaan maken: Zorgverzekering"]')
  await p.click('button[aria-label="Afvinken: Spaaroverboeking"]')
  await p.waitForSelector('button[aria-label="Ongedaan maken: Spaaroverboeking"]')
  await p.reload()
  await p.click('nav >> text=Maand')
  await p.waitForSelector('text=Checklist')
  assert(await p.isVisible('button[aria-label="Ongedaan maken: Zorgverzekering"]'), 'Afgevinkte post blijft afgevinkt na herladen')

  // 3. Assistent
  await p.click('button[aria-label="Assistent openen"]')
  await p.fill('#assistant-input', 'Ik heb €45 getankt')
  await p.click('button:has-text("Stuur")')
  await p.locator('button:has-text("Bevestig")').last().click()
  await p.waitForSelector('text=Opgeslagen: uitgave')
  await p.fill('#assistant-input', 'Mijn auto heeft €250 gekost')
  await p.click('button:has-text("Stuur")')
  await p.locator('button:has-text("Bevestig")').last().click()
  await p.waitForSelector('text=Opgeslagen: onderhoud')
  await p.fill('#assistant-input', 'Hoeveel kan ik deze maand nog uitgeven?')
  await p.click('button:has-text("Stuur")')
  await p.waitForTimeout(300)
  assert((await body()).includes('nog € 1.420,00 vrij uitgeven'), 'Budget en autoreserve raken vrij budget niet')
  await p.click('button:has-text("Sluiten")')

  await p.reload()
  await p.click('nav >> text=Sparen')
  assert((await body()).includes('€ 600,00'), 'Spaarsaldo na herladen')
  await p.screenshot({ path: OUT + '/1-sparen.png', fullPage: true })
  assert(errors.length === 0, 'Geen JavaScript-fouten' + (errors.length ? ': ' + errors.join(' | ') : ''))

  // 4. Bestaande gegevens (van vóór het instelscherm) blijven intact
  const ctx2 = await b.newContext({ ...devices['iPhone 13'] })
  const p2 = await ctx2.newPage()
  await p2.goto(URL)
  await p2.evaluate(() => {
    const legacy = { settings: { version: 1, startMonth: '2026-11', items: [
      { id: 'income', name: 'Salaris', kind: 'income', amount: 300000, dueDay: null, active: true, aliases: ['salaris'] },
      { id: 'rent', name: 'Huur', kind: 'bill', amount: 100000, dueDay: 1, active: true, aliases: ['huur'] },
      { id: 'savings', name: 'Spaaroverboeking', kind: 'savings', amount: 50000, dueDay: null, active: true, aliases: ['sparen'] },
    ], goal: { target: 500000, stretch: 800000, targetDate: '2027-12-31' }, milestones: [50000], reminders: [], notificationsEnabled: false, updatedAt: new Date().toISOString() },
    months: {}, transactions: [{ id: 't1', type: 'savings_deposit', amount: 12345, date: '2026-11-02', month: '2026-11', category: 'Sparen', note: 'x', source: 'handmatig', createdAt: new Date().toISOString() }], dismissed: [] }
    localStorage.setItem('financial-reset:v1', JSON.stringify(legacy))
  })
  await p2.reload()
  await p2.waitForSelector('text=Nog vrij te besteden')
  const t2 = (await p2.textContent('body')).replace(/ /g, ' ')
  assert(!t2.includes('Stel je maandplan in') && t2.includes('€ 1.500,00') && t2.includes('€ 123,45'), 'Bestaande gegevens: geen instelscherm, bedragen en saldo intact')
  await b.close()
})()
