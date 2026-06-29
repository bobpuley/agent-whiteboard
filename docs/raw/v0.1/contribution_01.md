Hai già identificato un pattern molto interessante: **l'agente CLI non ha realmente bisogno di "grafica"**, ha bisogno di un **canale cognitivo visuale condiviso** con l'utente.

Il tuo hack con `CLAUDE_SCREEN.md` + Mermaid è già una versione minimale di questo concetto.

Secondo me la domanda da porsi non è:

> "Come faccio a far disegnare diagrammi all'agente?"

ma:

> "Come creo un secondo spazio di lavoro persistente e visuale che l'agente possa usare durante l'insegnamento?"

Questa differenza cambia parecchio l'architettura.

---

# 1. Cosa manca oggi a un teacher/coach agent CLI

Un agente CLI è molto forte su:

* generazione di testo
* codice
* reasoning
* navigazione di file

ma è debole su:

### A. Memoria spaziale

Se spiego:

* un'architettura microservizi
* una rete neurale
* un dependency graph
* un workflow

il testo lineare è il mezzo sbagliato.

L'umano ragiona con:

* chunk visuali
* relazioni spaziali
* colori
* grouping

Mermaid aiuta già molto.

---

### B. Progressive disclosure

Un bravo insegnante non mostra tutto subito.

Fa:

```
step 1
   ↓
step 2
   ↓
step 3
```

In CLI spesso ottieni:

```
mega wall of text
```

Manca una "lavagna".

---

### C. Focus condiviso

L'agente non può dire:

> guarda questo blocco

> ora evidenzio questo nodo

> adesso aggiungo un nuovo componente

Excalidraw o tldraw permettono esattamente questo.

---

### D. Feedback visuale

L'agente non vede cosa l'utente sta guardando.

Un sistema ideale dovrebbe avere:

```json
{
  "viewport": ...,
  "selectedNodes": ...
}
```

così il coach sa dove l'utente è concentrato.

---

### E. Temporalità

Molte spiegazioni richiedono animazione.

Esempi:

* TCP handshake
* Raft
* leader election
* garbage collection
* event loop
* gradient descent

Mermaid è statica.

---

# 2. Requisiti che definirei

Io partirei da capability invece che da tecnologia.

---

## Livello 1 — Diagrammi

Minimo indispensabile.

L'agente deve poter:

```json
createDiagram()
updateDiagram()
deleteNode()
highlightNode()
```

Tipologie:

* flowchart
* sequence diagram
* architecture
* mindmap

Mermaid è sufficiente.

---

## Livello 2 — Canvas

L'agente manipola oggetti.

```json
createShape()
moveShape()
connectShapes()
```

Qui entri in:

* Excalidraw
* tldraw
* draw.io

---

## Livello 3 — Presentazione

L'agente insegna.

Serve:

```json
nextStep()
focus(element)
hide(elements)
show(elements)
```

quasi una PowerPoint pilotata da AI.

Questo è molto più raro.

---

## Livello 4 — Simulazione

L'agente mostra sistemi dinamici.

Esempi:

* scheduler
* cache
* network packets
* processi concorrenti

Serve:

```json
timeline
animation
state transitions
```

---

## Livello 5 — Bidirezionalità

Secondo me è il vero game changer.

L'utente modifica il diagramma.

L'agente vede la modifica.

```json
User drags node

↓

agent receives event

↓

agent adapts explanation
```

---

# 3. Opzioni esistenti

Le dividerei in 4 categorie.

---

## Opzione A — Evoluzione del tuo approccio Mermaid

Stack:

* markdown
* Mermaid
* Obsidian

Pro:

* semplicissimo
* versionabile
* diffabile
* locale

Contro:

* statico
* poco interattivo

Per system design resta sorprendentemente efficace.

---

## Opzione B — Excalidraw + API/MCP

Questa oggi è probabilmente la soluzione più promettente.

Ci sono già:

* Excalidraw MCP
* API pubbliche
* Mermaid → Excalidraw
* sincronizzazione realtime

([MCP.Directory][1])

Esempio:

```text
Claude Code
      ↓
MCP
      ↓
Excalidraw
      ↓
Browser
```

L'agente crea e modifica il canvas in tempo reale.

Vantaggi:

* editing umano
* editing AI
* persistenza
* export

---

## Opzione C — tldraw

Molto interessante se vuoi costruire un prodotto.

Ha:

* SDK eccellente
* canvas collaborativo
* Mermaid import
* MCP App

([tldraw.dev][2])

Architettura possibile:

```text
Agent
   ↓ REST
Backend
   ↓
tldraw canvas
```

Qui puoi implementare facilmente:

* zoom
* focus
* highlight
* step-by-step

---

## Opzione D — MCP Apps

Secondo me è la direzione futura.

L'idea:

un tool non restituisce:

```json
{
  "result": "..."
}
```

ma

```json
{
  "ui": ...
}
```

cioè l'agente produce direttamente componenti visuali.

([Reddit][3])

Questo trasforma il coach agent da:

> generatore di testo

a

> generatore di esperienze interattive

---

# Cosa farei io

Se dovessi progettare oggi un "Teaching Canvas for AI Agents":

### V1

* web app
* tldraw
* REST API
* websocket

API:

```http
POST /shapes
POST /connections
POST /highlight
POST /camera
```

---

### V2

Aggiungerei:

```http
POST /timeline
POST /animation
```

per animazioni semplici.

---

### V3

Introducerei un modello dichiarativo.

L'agente non disegna.

L'agente produce:

```json
{
  "lesson": {
    "steps": [...]
  }
}
```

e il renderer decide come visualizzarla.

---

# Un'intuizione che secondo me vale esplorare

Il problema non è "Mermaid vs Excalidraw".

Il problema è che gli agenti oggi producono:

```text
output
```

mentre un teacher efficace dovrebbe produrre:

```json
{
  "speech": "...",
  "canvas_state": "...",
  "focus": "...",
  "next_actions": "..."
}
```

Quasi un equivalente di una lavagna digitale condivisa.

Da quello che descrivi, il tuo `CLAUDE_SCREEN.md` è già una prima implementazione di questo concetto. Io non lo vedrei come un hack temporaneo: lo vedrei come il prototipo di un **Visual Context Channel** per agenti CLI. La vera evoluzione naturale è passare da "file markdown renderizzato" a "canvas condiviso con stato e API", probabilmente costruito sopra [tldraw](https://tldraw.dev?utm_source=chatgpt.com) oppure [Excalidraw](https://excalidraw.com?utm_source=chatgpt.com), che oggi sono gli ecosistemi più maturi per questo tipo di integrazione.

[1]: https://mcp.directory/mcp/details/1844/excalidraw-mcp-server?utm_source=chatgpt.com "Excalidraw MCP Server — MCP Server — MCP.Directory"
[2]: https://tldraw.dev/docs/mermaid?utm_source=chatgpt.com "Mermaid diagrams • tldraw Docs"
[3]: https://www.reddit.com/r/OpenWebUI/comments/1s4pccv/open_webui_can_now_run_mcp_apps_interactive_uis/?utm_source=chatgpt.com "Open WebUI CAN NOW RUN MCP APPS — interactive UIs from any MCP server, rendered inline in chat. A single Tool file is all you need."
