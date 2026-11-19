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
  await p2.goto(URL + '#dashboard')
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

  // 5. Vandaag: dagelijks plan (alleen in de versie van Dave), op een vaste datum en tijd
  const ctx3 = await b.newContext({ ...devices['iPhone 13'] })
  const p3 = await ctx3.newPage()
  p3.on('pageerror', (e) => errors.push(String(e)))
  await p3.clock.install({ time: new Date(2027, 0, 4, 17, 30) }) // maandag 4 januari 2027, 17:30
  await p3.goto(URL + '#dashboard')
  await p3.evaluate(() => localStorage.setItem('financial-reset:v1', JSON.stringify({ settings: { version: 1, startMonth: '2027-01', items: [], goal: { target: 0, stretch: 0, targetDate: '2027-12-31' }, milestones: [], reminders: [], notificationsEnabled: false, setupDone: true, updatedAt: new Date().toISOString() }, months: {}, transactions: [], dismissed: [] })))
  await p3.goto(URL)
  await p3.waitForSelector('text=Gewoontes vandaag')
  let t3 = await p3.textContent('body')
  assert(t3.includes('Goedemiddag, Dave') && t3.includes('maandag 4 januari'), 'Vandaag is het startscherm met begroeting en datum')
  assert(t3.includes('Sporten') && t3.includes('17:15–18:30') && t3.includes('ION of school'), 'Planning volgt je vaste week')
  assert(await p3.isVisible('text=Nu') , 'Toont wat nu bezig is')
  await p3.click('button[aria-label="Afvinken: Sporten"]')
  await p3.click('button[aria-label="Afvinken: Op tijd op"]')
  await p3.click('button[aria-label="Afvinken: Skincare ochtend"]')
  await p3.click('button[aria-label="Afvinken: Eén ION-taak"]')
  assert(await p3.isVisible('button[aria-label="Ongedaan maken: Bewegen"]'), 'Training afvinken vinkt ook Bewegen af')
  await p3.reload()
  await p3.waitForSelector('text=Gewoontes vandaag')
  assert(await p3.isVisible('button[aria-label="Ongedaan maken: Eén ION-taak"]'), 'Vinkjes blijven staan na herladen')
  assert((await p3.textContent('body')).includes('4 van 7'), 'Dagscore telt mee')
  await p3.click('text=Lichaam >> nth=-1')
  await p3.fill('#pillar-value', '3,5')
  await p3.click('button:has-text("Opslaan")')
  assert((await p3.textContent('body')).includes('3,5 / 10 km'), 'Pijler bijwerken (langste loop)')
  await p3.screenshot({ path: OUT + '/2-vandaag.png', fullPage: true })

  // Agenda aanpassen: avondblok alleen vandaag naar School, daarna voor elke maandag een andere tijd
  await p3.click('button[aria-label="Bewerken: ION of school"]')
  await p3.click('button[aria-pressed]:has-text("School") >> nth=0')
  await p3.click('button:has-text("Opslaan")')
  await p3.waitForSelector('text=Deze dag wijkt af van je vaste week')
  assert(await p3.isVisible('button[aria-label="Bewerken: School"]'), 'Blok alleen voor vandaag aangepast')
  await p3.click('button:has-text("Terug naar vaste week")')
  await p3.click('button:has-text("Mijn week") >> nth=0')
  await p3.click('button[aria-label="Bewerken: maandag Sporten"]')
  await p3.fill('#block-start', '17:45')
  await p3.click('button:has-text("Opslaan")')
  await p3.click('button:has-text("Klaar")')
  await p3.reload(); await p3.waitForSelector('text=Gewoontes vandaag')
  assert((await p3.textContent('body')).includes('17:45–18:30'), 'Vaste week aangepast en bewaard na herladen')
  await p3.click('button:has-text("Blok toevoegen")')
  await p3.fill('#block-title', 'Tandarts'); await p3.fill('#block-start', '08:00'); await p3.fill('#block-end', '08:30')
  await p3.click('button:has-text("Opslaan")')
  assert(await p3.isVisible('button[aria-label="Bewerken: Tandarts"]'), 'Eigen blok toegevoegd')
  assert(!(await p3.isVisible('button[aria-label="Assistent openen"]')), 'Geen Meld-iets-knop over het plan heen')
  await p3.click('nav >> text=Geld')
  await p3.waitForSelector('text=Nog vrij te besteden')
  assert(errors.length === 0, 'Geen JavaScript-fouten op Vandaag' + (errors.length ? ': ' + errors.join(' | ') : ''))

  // 6. Versie van Sophie heeft geen tabblad Vandaag
  const p4 = await (await b.newContext({ ...devices['iPhone 13'] })).newPage()
  await p4.goto(URL + 'sophie/')
  await p4.waitForSelector('text=Stel je maandplan in')
  assert(!(await p4.textContent('body')).includes('Vandaag') && !(await p4.textContent('body')).includes('Gewoontes'), 'Sophie: geen tabblad Vandaag')
  await b.close()
})()
