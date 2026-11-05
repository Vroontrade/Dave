# Finance

Persoonlijke financiële PWA voor iPhone: maandbudget, vaste lasten afvinken, spaardoel met stretchdoel, autoreserve, Nederlandse assistent, herinneringen, kalender en analyse.

## Privacy
Er staan geen persoonlijke bedragen in de code. Bij het eerste gebruik vul je je eigen plan in via het instelscherm; alles wordt alleen op je eigen apparaat bewaard.

## Techniek
- React 18 + TypeScript + Tailwind CSS, gebouwd met Vite.
- Alle bedragen intern in hele centen; alle totalen worden live berekend (`src/lib/calc.ts`).
- Eén bron van waarheid: transacties. Een afgevinkte post = precies één gekoppelde transactie, dus nooit dubbel afgetrokken.
- Opslag (`src/lib/storage.ts`):
  - In Claude (Artifact): privé in je Claude-account (`data/users/<jouw id>/fr-*`), met lokale kopie.
  - Losse PWA: localStorage, dagelijkse automatische back-up (14 dagen), JSON-back-up en CSV-export.
- Assistent: regelgebaseerde parser (`src/lib/parser.ts`), altijd eerst bevestigen.
- Herinneringen: in de app + export naar iPhone Agenda (.ics) met meldingen.

## Commando's
```
npm install
npm test               # reken-, parser- en opslagtests (neutrale voorbeeldbedragen)
npm run build          # losse PWA in dist/ (voor GitHub Pages / Netlify)
npm run build:artifact # één HTML-bestand voor Claude Artifact
node e2e/run.cjs <map> # browsertest op iPhone-formaat (vereist `npx vite preview --port 4173`)
```

## Op de iPhone zetten (losse versie)
1. Host de map `dist/` op HTTPS (bijv. GitHub Pages).
2. Open de URL in Safari → deelknop → "Zet op beginscherm".

## Mogelijke uitbreiding
AI-assistent: alleen via een eigen server-functie (bijv. Cloudflare Worker) zodat er nooit een API-sleutel in de frontend staat.
