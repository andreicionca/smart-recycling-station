# Smart Recycling Station

Aplicație web educațională ce simulează o stație industrială de sortare: **cameră = senzor → software → AI = decizie → HMI → operator uman → mecanism fizic**.

Telefonul transmite camera live către laptop prin WebRTC. La apăsarea butonului de detecție, interfața rulează o secvență de aproximativ 3 secunde, capturează automat un singur cadru și îl trimite unei funcții Netlify pentru clasificare. Imaginea și rezultatul nu sunt salvate permanent.

## Arhitectură

- `index.html` — alegerea modului de utilizare;
- `scan.html` — camera și controlul scanării pe telefon;
- `display.html` — HMI fullscreen pe laptop/proiector;
- `css/style.css` — stilul responsive, industrial;
- `js/webrtc.js` — utilitare WebRTC și signaling;
- `js/scan.js` — cameră, secvență, captură și analiză;
- `js/display.js` — flux video, stări și rezultat;
- `netlify/functions/signaling.js` — ofertă/răspuns WebRTC temporare în Netlify Blobs;
- `netlify/functions/analyze-image.js` — modul demo sau apelul AI vision;
- `netlify.toml` — configurarea publicării și antetele de securitate.

Signaling-ul folosește polling scurt și citiri Netlify Blobs cu consistență puternică. După negociere, video-ul și stările aplicației circulă direct între browsere. Sesiunile expiră după 15 minute.

## Rulare locală

Cerință: Node.js 20 sau mai nou.

```bash
npm install
cp .env.example .env
npm run dev
```

Deschide adresa indicată de Netlify CLI. Pentru o verificare rapidă pe același calculator, deschide `display.html` într-o fereastră și `scan.html` în alta.

> Camera browserului funcționează numai într-un context securizat (`https://`) sau pe `localhost`. Pentru testarea reală telefon + laptop, cea mai simplă variantă este un deploy Netlify, care oferă automat HTTPS. O adresă locală de forma `http://192.168...` nu va putea porni camera pe majoritatea telefoanelor.

## Publicare GitHub → Netlify

1. Creează un repository GitHub și copiază toate fișierele proiectului în rădăcina lui.
2. În Netlify alege **Add new project → Import an existing project** și conectează repository-ul.
3. Netlify va detecta `netlify.toml`. Nu este necesară o comandă de build; directorul publicat este rădăcina proiectului.
4. Configurează variabilele de mediu descrise mai jos.
5. Publică site-ul și folosește adresa HTTPS furnizată de Netlify.

## Variabile de mediu

În Netlify: **Project configuration → Environment variables**.

| Variabilă | Obligatorie | Rol |
|---|---:|---|
| `DEMO_MODE` | Da pentru demo | `true` dezactivează apelul AI și simulează aleator una dintre cele patru categorii. |
| `OPENAI_API_KEY` | Da pentru AI real | Cheia API este folosită numai în funcția Netlify și nu ajunge în browser. |
| `OPENAI_MODEL` | Nu | Model vision folosit; implicit `gpt-4.1-mini`. |

Pentru atelier fără AI real setează doar:

```text
DEMO_MODE=true
```

Pentru AI real:

```text
DEMO_MODE=false
OPENAI_API_KEY=cheia-ta
OPENAI_MODEL=gpt-4.1-mini
```

După schimbarea variabilelor, inițiază un deploy nou.

## Utilizare în atelier

1. Conectează telefonul și laptopul la aceeași rețea Wi-Fi.
2. Pe laptop deschide `https://site-ul-tau.netlify.app/display.html`.
3. Display-ul generează un **COD SESIUNE** din 4 cifre.
4. Pe telefon deschide `https://site-ul-tau.netlify.app/scan.html` și permite accesul la camera din spate.
5. Introdu codul de pe laptop și apasă **CONECTEAZĂ**.
6. După apariția camerei live pe laptop, așază obiectul și apasă **PORNEȘTE DETECȚIA**.
7. Urmează indicația mare de pe display. Operatorul poate verifica sau corecta recomandarea AI.

Pentru proiector apasă butonul `⛶` din dreapta sus pe display.

## Categorii

- `PLASTIC` → **PLASTIC**
- `PAPER` → **HÂRTIE**
- `OTHER` → **ALTELE**
- `HUMAN_CHECK` → **VERIFICARE UMANĂ**

Funcția folosește Structured Outputs (JSON Schema), validează din nou răspunsul și respinge orice categorie neașteptată. Aplicația nu inventează un procent de încredere; îl afișează numai dacă un backend viitor furnizează explicit o valoare numerică validă.

## Limitări WebRTC

Implementarea include un server STUN public, dar nu include TURN. În aceeași rețea Wi-Fi conexiunea ar trebui să funcționeze în mod normal. Unele rețele școlare/corporate restrictive sau un NAT simetric pot bloca legătura directă. Pentru acele medii se poate adăuga ulterior un serviciu TURN în lista `ICE_SERVERS` din `js/webrtc.js`.

Codul de 4 cifre este potrivit pentru o demonstrație temporară, nu pentru transmisii private sau expuse pe termen lung. Datele de signaling nu conțin fotografiile capturate și expiră logic după 15 minute.

## Depanare rapidă

- **Camera nu pornește:** verifică permisiunea browserului și faptul că pagina este HTTPS.
- **Laptopul nu primește video:** verifică același cod, aceeași rețea și dezactivează temporar VPN-ul.
- **Conexiune pierdută:** aplicația încearcă automat reconectarea; dacă nu reușește, generează cod nou.
- **Analiza AI eșuează:** verifică `OPENAI_API_KEY`, creditul/limitele contului și logurile funcției în Netlify.
- **Atelier fără API:** setează `DEMO_MODE=true` și publică din nou.

## Confidențialitate

Fluxul video WebRTC este peer-to-peer. La scanare, un singur cadru JPEG redus la maximum 1024 px este trimis funcției de analiză. Proiectul nu scrie cadrele, fotografiile sau rezultatele într-o bază de date.
