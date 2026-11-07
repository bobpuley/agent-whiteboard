# Testing the Agent Whiteboard skills

Manual test plan for the five skills in `skills/` and the `install-skills` command.
Run it before committing/releasing. Use a **scratch project**, not this repo, so the test mirrors a real user.

## 0. Prerequisites
- Node ≥ 18; this repo built (`npm run build`) so `dist/` exists.
- Claude Code installed.
- A scratch folder, e.g. `mkdir ~/tmp/wb-skills-test && cd ~/tmp/wb-skills-test`.

## 1. Test `install-skills`

Use a throwaway HOME so your real `~/.claude/skills` is untouched:

```bash
export TESTHOME=$(mktemp -d)
CLI=/Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js

HOME=$TESTHOME node $CLI install-skills --list          # 5 names
HOME=$TESTHOME node $CLI install-skills                 # installs 5 into $TESTHOME/.claude/skills
HOME=$TESTHOME node $CLI install-skills                 # all "skipped"
HOME=$TESTHOME node $CLI install-skills --force --only whiteboard-design   # reinstalls 1
HOME=$TESTHOME node $CLI install-skills --only nope; echo "exit=$?"        # error, exit=1
node $CLI install-skills --bogus; echo "exit=$?"                           # usage, exit=2
node $CLI install-skills --project                      # run inside the scratch project → ./.claude/skills
```

Pass criteria
- [ ] Listed/installed names are exactly: `agent-whiteboard`, `whiteboard-analysis`, `whiteboard-assessment`, `whiteboard-design`, `whiteboard-teaching`.
- [ ] Second run skips everything; `--force` overwrites; exit codes are 0 / 1 / 2 as above.
- [ ] A hand-edited `SKILL.md` survives a run without `--force`.
- [ ] `node $CLI` (no args) still starts the server and opens the browser (regression check on the `cli.js` change). Stop it with Ctrl+C.
- [ ] Optional packaging check: `npm pack`, then in an empty folder `npx ./agent-whiteboard-*.tgz install-skills --dir ./out` lists the five skills.

## 2. Set up the scratch project

```bash
cd ~/tmp/wb-skills-test
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js install-skills --project
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js &      # whiteboard server on :3000 (note the PID; kill that exact PID later)
cat > .mcp.json <<'E'
{ "mcpServers": { "agent-whiteboard": { "type": "sse", "url": "http://localhost:3000/mcp" } } }
E
claude        # start a NEW session here — skills load at session start
```

- [ ] Browser tab shows the whiteboard.
- [ ] `/mcp` in Claude Code shows `agent-whiteboard` connected.
- [ ] The skills are available (type `/` and look for the five names, or ask "which skills do you have?").

## 3. Scenario tests (paste each prompt in a fresh session or after `/clear`)

For every scenario also check the **general rules**:
- [ ] Every tool call carries a `workspace`.
- [ ] After showing something to review, the agent explains it in chat and calls `wait_done` (you click **Done** in the browser).
- [ ] No diagram source is dumped in chat.
- [ ] Invalid payloads are fixed and retried, not abandoned.

### 3.1 Teaching — concept explainer + build-up (`whiteboard-teaching`)
Prompt: *"Teach me how the TCP three-way handshake works. I'm a developer who knows HTTP but not TCP."*
- [ ] Loads the teaching skill (and the core one).
- [ ] Asks at most 1–2 questions about level/goal, or proceeds sensibly.
- [ ] Builds the handshake progressively: step-frames with labelled frames ("1. SYN" …), one added element per frame, `wait_done` between frames, `commit_step_frames` at the end.
- [ ] You can `step`/replay the committed sequence in the browser.

### 3.2 Teaching — branching (`whiteboard-teaching`, workflow E)
Prompt: *"Give me a clickable map of how a web request travels (DNS, TCP, TLS, HTTP, server) and let me pick what to dive into."*
- [ ] Renders a `flowchart`, arms `wait_click` with `node_actions` (menu on node click).
- [ ] After your click, explains that node and re-arms the map.

### 3.3 Assessment — inline quiz (`whiteboard-assessment`)
Prompt: *"Quiz me on what we just covered with 4 questions and show me my score right away."*
- [ ] Quiz payload has a `correct` option on **every** question (inline mode); at least one `multiple` question with `partial` weights summing to 1.
- [ ] Submit is disabled until all questions are answered; result and total appear after Submit; light **and** dark theme legible.
- [ ] Agent calls `wait_quiz` and comments on misses without re-scoring.

### 3.4 Assessment — deferred quiz (`whiteboard-assessment`)
Prompt: *"Give me a 3-question quiz but grade it yourself and explain my mistakes. Don't show the answers in the page."*
- [ ] Payload has **no** `correct` flags; the page shows no result after Submit (only "Sent ✓").
- [ ] Agent receives questions/answers via `wait_quiz`, grades, reports the score in chat.
- [ ] Edge: submit **before** the agent calls `wait_quiz` (ask it to pause in chat first) — the answer is still delivered.
- [ ] Remediation: for a miss the agent re-explains with a visual and asks a *new* question.


# Testing the Agent Whiteboard skills

Manual test plan for the five skills in `skills/` and the `install-skills` command.
Run it before committing/releasing. Use a **scratch project**, not this repo, so the test mirrors a real user.

## 0. Prerequisites
- Node ≥ 18; this repo built (`npm run build`) so `dist/` exists.
- Claude Code installed.
- A scratch folder, e.g. `mkdir ~/tmp/wb-skills-test && cd ~/tmp/wb-skills-test`.

## 1. Test `install-skills`

Use a throwaway HOME so your real `~/.claude/skills` is untouched:

```bash
export TESTHOME=$(mktemp -d)
CLI=/Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js

HOME=$TESTHOME node $CLI install-skills --list          # 5 names
HOME=$TESTHOME node $CLI install-skills                 # installs 5 into $TESTHOME/.claude/skills
HOME=$TESTHOME node $CLI install-skills                 # all "skipped"
HOME=$TESTHOME node $CLI install-skills --force --only whiteboard-design   # reinstalls 1
HOME=$TESTHOME node $CLI install-skills --only nope; echo "exit=$?"        # error, exit=1
node $CLI install-skills --bogus; echo "exit=$?"                           # usage, exit=2
node $CLI install-skills --project                      # run inside the scratch project → ./.claude/skills
```

Pass criteria
- [ ] Listed/installed names are exactly: `agent-whiteboard`, `whiteboard-analysis`, `whiteboard-assessment`, `whiteboard-design`, `whiteboard-teaching`.
- [ ] Second run skips everything; `--force` overwrites; exit codes are 0 / 1 / 2 as above.
- [ ] A hand-edited `SKILL.md` survives a run without `--force`.
- [ ] `node $CLI` (no args) still starts the server and opens the browser (regression check on the `cli.js` change). Stop it with Ctrl+C.
- [ ] Optional packaging check: `npm pack`, then in an empty folder `npx ./agent-whiteboard-*.tgz install-skills --dir ./out` lists the five skills.

## 2. Set up the scratch project

```bash
cd ~/tmp/wb-skills-test
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js install-skills --project
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js &      # whiteboard server on :3000 (note the PID; kill that exact PID later)
cat > .mcp.json <<'E'
{ "mcpServers": { "agent-whiteboard": { "type": "sse", "url": "http://localhost:3000/mcp" } } }
E
claude        # start a NEW session here — skills load at session start
```

- [ ] Browser tab shows the whiteboard.
- [ ] `/mcp` in Claude Code shows `agent-whiteboard` connected.
- [ ] The skills are available (type `/` and look for the five names, or ask "which skills do you have?").

## 3. Scenario tests (paste each prompt in a fresh session or after `/clear`)

For every scenario also check the **general rules**:
- [ ] Every tool call carries a `workspace`.
- [ ] After showing something to review, the agent explains it in chat and calls `wait_done` (you click **Done** in the browser).
- [ ] No diagram source is dumped in chat.
- [ ] Invalid payloads are fixed and retried, not abandoned.

### 3.1 Teaching — concept explainer + build-up (`whiteboard-teaching`)
Prompt: *"Teach me how the TCP three-way handshake works. I'm a developer who knows HTTP but not TCP."*
- [ ] Loads the teaching skill (and the core one).
- [ ] Asks at most 1–2 questions about level/goal, or proceeds sensibly.
- [ ] Builds the handshake progressively: step-frames with labelled frames ("1. SYN" …), one added element per frame, `wait_done` between frames, `commit_step_frames` at the end.
- [ ] You can `step`/replay the committed sequence in the browser.

### 3.2 Teaching — branching (`whiteboard-teaching`, workflow E)
Prompt: *"Give me a clickable map of how a web request travels (DNS, TCP, TLS, HTTP, server) and let me pick what to dive into."*
- [ ] Renders a `flowchart`, arms `wait_click` with `node_actions` (menu on node click).
- [ ] After your click, explains that node and re-arms the map.

### 3.3 Assessment — inline quiz (`whiteboard-assessment`)
Prompt: *"Quiz me on what we just covered with 4 questions and show me my score right away."*
- [ ] Quiz payload has a `correct` option on **every** question (inline mode); at least one `multiple` question with `partial` weights summing to 1.
- [ ] Submit is disabled until all questions are answered; result and total appear after Submit; light **and** dark theme legible.
- [ ] Agent calls `wait_quiz` and comments on misses without re-scoring.

### 3.4 Assessment — deferred quiz (`whiteboard-assessment`)
Prompt: *"Give me a 3-question quiz but grade it yourself and explain my mistakes. Don't show the answers in the page."*
- [ ] Payload has **no** `correct` flags; the page shows no result after Submit (only "Sent ✓").
- [ ] Agent receives questions/answers via `wait_quiz`, grades, reports the score in chat.
- [ ] Edge: submit **before** the agent calls `wait_quiz` (ask it to pause in chat first) — the answer is still delivered.
- [ ] Remediation: for a miss the agent re-explains with a visual and asks a *new* question.
  4,973
# Test delle skill di Agent Whiteboard

Piano di test manuale per le cinque skill presenti in `skills/` e per il comando `install-skills`.
Da eseguire prima di ogni commit o rilascio. Utilizzare un **progetto di prova** (scratch project) — non questo repository — in modo che il test rispecchi l'esperienza di un utente reale.

## 0. Prerequisiti
- Node ≥ 18; il repository deve essere compilato (`npm run build`) in modo che la directory `dist/` sia presente.
- Claude Code installato.
- Una cartella di prova (scratch folder), ad esempio: `mkdir ~/tmp/wb-skills-test && cd ~/tmp/wb-skills-test`.

## 1. Test di `install-skills`

Utilizzare una variabile `HOME` temporanea per evitare di modificare la directory `~/.claude/skills` reale:

```bash
export TESTHOME=$(mktemp -d)
CLI=/Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js

HOME=$TESTHOME node $CLI install-skills --list          # 5 nomi
HOME=$TESTHOME node $CLI install-skills                 # installa le 5 skill in $TESTHOME/.claude/skills
HOME=$TESTHOME node $CLI install-skills                 # tutte "skipped" (saltate)
HOME=$TESTHOME node $CLI install-skills --force --only whiteboard-design   # reinstalla 1 skill
HOME=$TESTHOME node $CLI install-skills --only nope; echo "exit=$?" # errore, exit=1
node $CLI install-skills --bogus; echo "exit=$?" # errore di utilizzo, exit=2
node $CLI install-skills --project                      # esecuzione all'interno del progetto di prova → ./.claude/skills
```

Criteri di superamento
- [ ] I nomi elencati/installati sono esattamente: `agent-whiteboard`, `whiteboard-analysis`, `whiteboard-assessment`, `whiteboard-design`, `whiteboard-teaching`.
- [ ] La seconda esecuzione non installa nulla (tutto viene saltato); l'opzione `--force` sovrascrive i file; i codici di uscita (exit code) sono 0, 1 o 2 come indicato sopra.
- [ ] Un file `SKILL.md` modificato manualmente rimane invariato dopo un'esecuzione che non utilizza `--force`. - [ ] `node $CLI` (senza argomenti) avvia correttamente il server e apre il browser (verifica di regressione relativa alla modifica in `cli.js`). Per interrompere, utilizzare Ctrl+C.
- [ ] Verifica opzionale del pacchetto: eseguire `npm pack`, quindi, in una cartella vuota, lanciare `npx ./agent-whiteboard-*.tgz install-skills --dir ./out`; l'operazione dovrebbe elencare le cinque skill.

## 2. Configurazione del progetto di prova

```bash
cd ~/tmp/wb-skills-test
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js install-skills --project
node /Users/marcopugliese/workspaces/agent-whiteboard/bin/cli.js &      # server whiteboard sulla porta :3000 (annotare il PID; sarà necessario terminarlo in seguito)
cat > .mcp.json <<'E'
{ "mcpServers": { "agent-whiteboard": { "type": "sse", "url": "http://localhost:3000/mcp" } } }
E
claude        # avviare una NUOVA sessione — le skill vengono caricate all'avvio della sessione
```

- [ ] La scheda del browser mostra la whiteboard.
- [ ] Il comando `/mcp` in Claude Code conferma che `agent-whiteboard` è connesso.
- [ ] Le skill sono disponibili (digitare `/` e verificare la presenza dei cinque nomi, oppure chiedere "quali skill hai a disposizione?").

## 3. Test degli scenari (incollare ogni prompt in una nuova sessione o dopo aver eseguito `/clear`)

Per ogni scenario, verificare anche le **regole generali**:
- [ ] Ogni chiamata a uno strumento include il parametro `workspace`.
- [ ] Dopo aver mostrato un contenuto da revisionare, l'agente fornisce una spiegazione in chat e richiama `wait_done` (l'utente deve cliccare su **Done** nel browser).
- [ ] Il codice sorgente del diagramma non viene visualizzato direttamente nella chat.
- [ ] Eventuali payload non validi vengono corretti e riproposti, anziché essere ignorati. ### 3.1 Insegnamento — spiegazione di concetti + costruzione graduale (`whiteboard-teaching`)
  Prompt: *"Spiegami come funziona il 'three-way handshake' di TCP. Sono uno sviluppatore: conosco HTTP, ma non TCP."*
- [ ] Carica la competenza di insegnamento (insieme a quella di base).
- [ ] Pone al massimo 1–2 domande sul livello o sugli obiettivi dell'utente, oppure procede in modo logico.
- [ ] Costruisce l'handshake per gradi: utilizza "step-frame" con etichette (es. "1. SYN"...), aggiungendo un elemento alla volta; inserisce `wait_done` tra i passaggi e conclude con `commit_step_frames`.
- [ ] È possibile riprodurre (`step`/replay) la sequenza salvata direttamente nel browser.

### 3.2 Insegnamento — struttura ramificata (`whiteboard-teaching`, workflow E)
Prompt: *"Mostrami una mappa interattiva del percorso di una richiesta web (DNS, TCP, TLS, HTTP, server) e fammi scegliere quale aspetto approfondire."*
- [ ] Genera un diagramma di flusso (`flowchart`) e configura `wait_click` con `node_actions` (un menu che appare cliccando su un nodo).
- [ ] Dopo il clic dell'utente, spiega il nodo selezionato e riattiva la mappa per ulteriori scelte.

### 3.3 Valutazione — quiz integrato (`whiteboard-assessment`)
Prompt: *"Mettimi alla prova su quanto abbiamo appena visto con 4 domande e mostrami subito il punteggio."*
- [ ] Il quiz include l'indicazione della risposta corretta (`correct`) per **ogni** domanda (modalità integrata); deve essere presente almeno una domanda a risposta multipla (`multiple`) con pesi parziali che sommano a 1.
- [ ] Il pulsante di invio rimane disabilitato finché non viene data risposta a tutte le domande; il risultato e il punteggio totale appaiono dopo l'invio. L'interfaccia deve essere leggibile sia in modalità chiara che scura.
- [ ] L'agente utilizza `wait_quiz` e fornisce commenti sugli errori commessi, senza modificare il punteggio.

### 3.4 Valutazione — quiz con correzione differita (`whiteboard-assessment`)
Prompt: *"Proponimi un quiz di 3 domande, ma correggilo tu stesso spiegandomi dove ho sbagliato. Non mostrare le risposte corrette all'interno della pagina."*
- [ ] Il contenuto del quiz **non** include flag che indichino la risposta corretta (`correct`). La pagina non mostra alcun risultato dopo l'invio (appare solo la scritta "Inviato ✓").
- [ ] L'agente riceve domande/risposte tramite `wait_quiz`, le valuta e comunica il punteggio in chat.
- [ ] Caso limite: l'invio avviene **prima** che l'agente richiami `wait_quiz` (è bene chiedere in chat di attendere prima di procedere) — la risposta viene comunque recapitata.
- [ ] Correzione: in caso di risposta errata, l'agente fornisce una spiegazione accompagnata da un supporto visivo e pone una *nuova* domanda.


### 3.5 Analisi (`whiteboard-analysis`)
Prompt: *"Crea un grafico delle vendite mensili per il 2025: gen 10, feb 12, mar 9, apr 15, mag 18, giu 17. Successivamente, suddividi i dati per due prodotti: al prodotto A viene assegnato il 60% di ogni mese."*
- [ ] JSON `vega-lite` valido, comprensivo di titolo, etichette degli assi e dati (`data.values`) inclusi direttamente nel codice.
- [ ] La seconda richiesta genera un nuovo rendering; entrambe le versioni sono disponibili nel pannello Cronologia (History).
- [ ] Richiesta successiva *"trasforma tutto in un breve report"*: sequenza di frame che alterna `html` e `vega-lite`, con l'opzione finale `export_html`.

### 3.6 Progettazione (`whiteboard-design`)
Prompt: *"Aiutami a progettare un servizio di accorciamento URL (URL shortener). Inizia con un diagramma ad alto livello e lasciami scegliere quale parte approfondire."*
- [ ] `Flowchart` ad alto livello (≤ ~9 nodi) con `wait_click` e `node_actions`; il diagramma viene ingrandito dopo un clic; nel titolo è presente un percorso di navigazione (breadcrumb).
- [ ] Richiesta successiva *"confronta l'uso di un database SQL rispetto a uno di tipo chiave-valore (key-value)"*: frame separati accompagnati da una tabella di confronto in `html`, che si conclude con una proposta di scelta.

### 3.7 Regole fondamentali e condivisione (`agent-whiteboard`)
Prompt, all'interno di un'unica sessione:
1. *"Mostrami la formula E = mc² e attendi che io sia pronto."* → `katex`, `wait_done`.
2. *"Elenca ciò che abbiamo disegnato finora ed esporta la lezione in formato HTML."* → `list_snapshots`, `export_html`; si noti che i quiz vengono sostituiti da una nota.
3. *"Come posso condividere questo spazio di lavoro con un collega?"* → indica il menu Importa/Esporta (file .zip) nel pannello Cronologia; **non** inventa uno strumento MCP inesistente.

## 4. Controlli negativi / di robustezza
- [ ] Interruzione del server durante la sessione: l'agente segnala il problema di connessione, anziché simulare un rendering che non può avvenire. - [ ] Richiesta di un quiz all'interno di una presentazione (slideshow): l'agente non lo esegue (il quiz prevede solo `render()`).
- [ ] Richiesta di un contenuto non visivo (es. "qual è la capitale della Francia?"): l'agente risponde semplicemente in chat, senza utilizzare la lavagna (whiteboard).

## 5. Registrazione dei risultati
| Area | Superato? | Note / formulazione della skill da correggere |
|---|---|---|
| install-skills | | |
| 3.1 teaching build-up | | |
| 3.2 branching | | |
| 3.3 inline quiz | | |
| 3.4 deferred quiz | | |
| 3.5 analysis | | |
| 3.6 design | | |
| 3.7 core / sharing | | |
| 4 negative | | |

Se il comportamento di una skill non è corretto, modifica la relativa descrizione nel file `skills/<name>/SKILL.md`, quindi esegui nuovamente `install-skills --force` e avvia una **nuova** sessione prima di ripetere il test.

## 6. Pulizia
```bash
kill <server PID>          # utilizza il PID specifico annotato al punto 2 — non usare mai pkill con il nome del processo
rm -rf ~/tmp/wb-skills-test "$TESTHOME"
```