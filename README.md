# Sound Visual Art

Trasforma un'immagine in arte animata e interattiva, direttamente nel browser. I segni cambiano di continuo e reagiscono al cursore o al dito. Puoi salvare un fotogramma come PNG o registrare un video.

Le immagini restano sul tuo dispositivo: la pagina non le carica da nessuna parte. Funziona anche su telefono e tablet.

## Come si usa

1. Apri la pagina e premi **Carica un'immagine** (JPG, PNG, WebP o GIF), oppure **Prova con un esempio**. Puoi anche trascinare un file sulla pagina.
2. Muovi il cursore, o trascina il dito, sull'immagine per agitare i segni. Un clic o un tocco manda un'onda.
3. Dal pannello scegli stile, colore ed effetti. Su telefono il pannello sta in basso: tocca una scheda per aprirlo, toccala di nuovo per chiuderlo.

L'ultima immagine e le impostazioni si ricordano sul dispositivo (nella memoria del browser, niente viene inviato): se la pagina si ricarica, riparti da dove eri. Per ricominciare da zero basta caricare un'altra immagine.

## Cosa contiene

- **17 stili.** Caratteri: ASCII, Braille, Testo, Contorni, Matrix, Emoji. Forme: Retino, Dithering, Pixel, Tratteggio, Puntini, Linee, Croci, Mosaico, Esagoni. Artistici: Vetrata (Voronoi) e Pennellate.
- **10 palette:** Originale, Fosforo, Ambra, Duotone, Game Boy, Termico, Neon, Blueprint, Seppia e un Gradiente a tre colori. In più luminosità, contrasto, saturazione, tinta, posterizzazione e inversione.
- **Glitch:** separazione RGB, VHS, rumore di pellicola, pixel sorting, glitch.
- **Distorsioni:** ondulazione, fisheye, vortice, specchio, caleidoscopio, increspatura al tocco.
- **Blob tracking:** trova le zone che spiccano nell'immagine (chiare, scure, di bordo o colorate) e le segue con riquadri, sigle, coordinate e linee verso i vicini. Il cursore è a sua volta un punto tracciato.
- **Effetti finali:** CRT e Bloom.
- **Avanzate:** suono reattivo (microfono o file audio), qualità bassa, media o piena anche automatica, statistiche dal vivo.
- **Salva PNG** e **Registra** un video (MP4 o WebM, con l'audio se è acceso). Il tracking e gli effetti finiscono anche nei file salvati.

## Scorciatoie da tastiera

| Tasto | Azione |
|---|---|
| 1–9, ← → | cambia stile |
| I | carica un'immagine |
| S | salva un PNG |
| R | avvia o ferma la registrazione |
| M | accende o spegne il microfono |
| H | nasconde i controlli |
| F | apre le statistiche |
| Spazio | pausa |

## Provarla in locale

Non serve nessuna installazione: puoi aprire `index.html` con un doppio clic. Il microfono, però, funziona solo da `localhost` o da un indirizzo `https`. Dalla cartella del progetto:

```bash
python -m http.server 8000
```

Poi apri `http://localhost:8000/`.

## Pubblicarla

Fai un Fork del repository, poi in Settings → Pages scegli *Deploy from a branch*, branch `main`, cartella `/` (root). Dopo un minuto il sito sarà online su `https://TUO-NOME.github.io/NOME-REPOSITORY/`.

## Come è fatta

Nessuna dipendenza e nessun passaggio di build. L'unica risorsa esterna sono i caratteri Geist, caricati da Google Fonts: se non si caricano, la pagina usa i caratteri di sistema.

- `index.html`: la pagina
- `css/app.css`: l'interfaccia
- `js/engine.js`: griglia, stili, distorsioni, suono, salvataggio e registrazione
- `js/fx.js`: effetti sopra il disegno e blob tracking
- `js/ui.js`: schede e controlli

## Licenza

MIT.
