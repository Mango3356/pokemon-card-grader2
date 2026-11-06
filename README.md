# Gem Mint Lab

Scanner e pre-grading AI di carte Pokémon e altri TCG, pensato per il telefono. Stile Notte Vetro: scuro con schede in vetro, menta e ambra (anche in versione chiara).

**Apri l'app:** https://mango3356.github.io/pokemon-card-grader2/

## Cosa fa

- **Scanner dal vivo**: inquadri la carta con la fotocamera, l'app trova i bordi, scatta da sola quando tieni fermo il telefono, raddrizza la prospettiva e ritaglia la carta.
- **Centratura automatica**: misura i bordi stampati sul fronte e sul retro e calcola i rapporti sinistra/destra e alto/basso. Puoi correggerla a mano con le maniglie e la lente.
- **Grading AI** (Gemini gratis o Claude): subgradi di centratura, angoli, bordi e superficie con i criteri ufficiali Beckett, più il voto previsto per **PSA, Beckett e CGC** in base alle loro soglie di centratura.
- **Slab digitali**: cronologia (ultimi 10) e salvati (fino a 100), con ingrandimento e condivisione come immagine.
- **Portfolio**: valore totale con grafico, quantità, prezzi modificabili, ricerca carte con stima prezzo.
- **Mercato**: "Da comprare" (liquidità, crescita, domanda, community, rischio, ROI stimato) e **Grade Flip** (raw contro PSA 10, BGS 10, CGC 10, con valore atteso).
- Funziona anche offline per scansione e centratura. Si installa sulla schermata Home come un'app.

## Come usarla sul telefono

1. Apri il link sopra con **Safari** (iPhone) o **Chrome** (Android).
2. Installa: Safari › Condividi › **Aggiungi alla schermata Home**; Chrome › menu ⋮ › **Installa app**.
3. Tocca **Scansiona una carta** e consenti l'accesso alla fotocamera.
4. Per il grading AI: ingranaggio in alto › scegli **Gemini (gratis)** con una chiave da [aistudio.google.com/apikey](https://aistudio.google.com/apikey), oppure **Claude (a pagamento)** con una chiave da [console.anthropic.com](https://console.anthropic.com/settings/keys).

### Consigli per una buona scansione
- Fondo uniforme che si distingua dalla carta, carta fuori dalla bustina. Per il retro blu: tavolo chiaro o di legno, non blu.
- Luce diffusa, senza riflessi sull'olografico (inclina leggermente il telefono se compare l'avviso).
- Tieni la carta dentro il riquadro e il telefono fermo finché scatta.

## Privacy e costi
- Foto, slab e portfolio restano **solo sul telefono** (IndexedDB). Puoi esportare un backup da Impostazioni.
- Le chiavi API restano salvate solo nel browser del telefono e vengono inviate solo a Google (Gemini) o ad Anthropic (Claude).
- Gemini ha un piano gratuito con limiti di richieste al minuto e al giorno. L'API di Claude si paga a consumo con credito prepagato, separato dall'abbonamento Claude.

## Limiti
- È un **pre-grading indicativo** da foto, non sostituisce PSA, Beckett o CGC.
- Le soglie PSA sotto il 9 sono approssimate: PSA considera anche l'aspetto generale.
- La centratura automatica funziona sul fronte e sul retro delle carte con bordo stampato; sulle full art va regolata a mano.
- I prezzi sono stime dell'AI, non quotazioni in tempo reale.

## Struttura
Sito statico, nessuna dipendenza, nessun build.
- `index.html` – markup
- `styles.css` – stile
- `app.js` – grading, slab, portfolio, mercato, impostazioni, archivio locale
- `scanner.js` – fotocamera, rilevamento bordi (Sobel + RANSAC), raddrizzamento prospettico, centratura automatica
- `sw.js`, `manifest.webmanifest` – app installabile e offline

Criteri di grading: [Beckett](https://www.beckett.com/grading/scale) · [CGC](https://www.cgccards.com/card-grading/grading-scale/) · [PSA](https://www.psacard.com/gradingstandards)
