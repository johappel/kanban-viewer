# Nostr Kanban Viewer

Einfache Referenz-Implementierung, um Boards darzustellen, die mit dem [`edufeed-org/kanban-editor`](https://github.com/edufeed-org/kanban-editor/) erstellt wurden.

Zielgruppe: Entwickler, die ein Nostr-Kanban-Board auf ihrer eigenen Website laden und rendern wollen.

## Ziel

Dieses Projekt zeigt den kompletten Read-Flow:

1. `naddr` dekodieren
2. Board-Daten aus Nostr-Events rekonstruieren
3. konsolidiertes UI-Modell rendern (Spalten, Karten, Kommentare)

Der zentrale Punkt ist [`buildBoardFromNostr`](./boardFromNostr.js).

## Als npm Modul verwenden

Das Repo ist auch als Modul vorbereitet und exportiert `KanbanBoardViewer`.

```js
import { KanbanBoardViewer } from "https://cdn.jsdelivr.net/gh/johappel/kanban-viewer@main/src/index.mjs";

const viewer = new KanbanBoardViewer({
  boardElement: document.getElementById("board"),
  boardMetaElement: document.getElementById("boardMeta"),
  statusElement: document.getElementById("status"),
});

await viewer.load({
  naddr: "naddr1...",
  relays: ["wss://relay.damus.io", "wss://nos.lol"],
});
```

**lokal**: dist-bundle/nostre-kanban-viewer.esm.js downloaden und lokal importieren:
```js 
import { KanbanBoardViewer } from "nostre-kanban-viewer.esm.js";
```

### Quick Start direkt aus GitHub (ohne npm publish)

Du kannst das Paket direkt aus dem GitHub-Repo installieren:

```bash
npm i github:johappel/kanban-viewer
```

Danach nutzt du es identisch:

```js
import { KanbanBoardViewer } from "nostre-kanban-viewer";

const viewer = new KanbanBoardViewer({
  boardElement: document.getElementById("board"),
  boardMetaElement: document.getElementById("boardMeta"),
  statusElement: document.getElementById("status"),
});

await viewer.load({
  naddr: "naddr1...",
  relays: ["wss://relay.damus.io"],
});
```

Für reine Datenrekonstruktion ohne UI:

```js
import NDK from "@nostr-dev-kit/ndk";
import { buildBoardFromNostr } from "nostre-kanban-viewer";
```

## Setup

Voraussetzungen:

- Node.js 20+
- npm

Start:

```bash
npm install
npm run dev
```

Dann die von Vite ausgegebene URL im Browser öffnen.

## Eingabe und Relay-Auswahl

In der UI ([`index.html`](./index.html), [`app.js`](./app.js)) gibst du ein:

- `naddr` des Boards
- eine Liste von Relay-URLs (kommagetrennt)

`app.js` dekodiert die `naddr` via `nip19.decode` und nutzt:

- `pubkey` als Board-Owner
- `identifier` als Board-ID (`d`-Tag)

Die finalen Relays werden zusammengeführt aus:

- Relay-Input-Feld
- optionalen Relays aus der `naddr`

## Datenmodell im UI

`buildBoardFromNostr` baut dieses Modell:

- `UiBoard`
- `UiColumn[]`
- `UiCard[]` mit `comments[]`

Damit bleibt das Rendering vom Event-Format entkoppelt.

## Flow von `buildBoardFromNostr`

Quelle: [`boardFromNostr.js`](./boardFromNostr.js)

### 1. Board-Referenz aufbauen

Aus `ownerPubkey` und `boardId` wird:

- `boardRef = "30301:<ownerPubkey>:<boardId>"`

Diese Referenz wird in `#a`-Filtern genutzt.

### 2. Basis-Events laden (parallel)

Es werden gleichzeitig folgende Abfragen ausgeführt:

1. `kind: 30301` (BOARD), `authors:[owner]`, `#d:[boardId]`  
   Ergebnis: genau ein Basis-Board-Event (`fetchEvent`)
2. `kind: 30302` (CARD), `#a:[boardRef]`  
   Ergebnis: alle Karten-Events zum Board
3. `kind: 8571` (PATCH), `#a:[boardRef]`
4. `kind: 8571` (PATCH), `#d:[boardId]`
5. `kind: 5` (DELETE), ohne zusätzliche Filter

Wenn kein Board-Event gefunden wird: `return null`.

### 3. Board-Grundstruktur aus 30301 aufbauen

Aus `30301` werden gelesen:

- `title`
- `description`
- `col`-Tags (Spalten)

Spalten werden nach der Positionsinformation im `col`-Tag sortiert.

### 4. Cards aus 30302 einhängen

Für jedes Card-Event:

- `d` -> Card-ID
- `s` -> Ziel-Spalte
- `title`, `description`, `rank`

Nur valide Karten (`d` + `s` + existierende Spalte) werden übernommen.

### 5. Patches konsolidieren und anwenden

`8571`-Events aus `#a` und `#d` werden:

1. per `event.id` dedupliziert
2. zeitlich sortiert (`updated_at_ms`, fallback `created_at`)
3. in Reihenfolge angewendet

Unterstützte Patch-Effekte:

- `col`: Spalten-Metadaten ändern (Name/Farbe)
- `del`: Spalten löschen
- `del-card`: Karten löschen
- `order`: Spaltenreihenfolge setzen

### 6. Kind-5-Deletions anwenden

Aus `kind:5` werden `a`-Tags ausgewertet:

- trifft `30301:<owner>:<boardId>` -> Board gilt als gelöscht (`return null`)
- trifft `30302:...` -> entsprechende Karte wird entfernt

### 7. Kommentare je Karte laden

Für jede verbleibende Karte:

- `kind:1` (COMMENT) mit `#a:["30302:<author>:<cardId>"]`

Kommentare werden aufbereitet und nach `createdAt` sortiert.

### 8. Finale Sortierung je Spalte

Karten in jeder Spalte werden sortiert nach:

1. `rank` (aufsteigend)
2. fallback deterministisch: `eventId` lexikografisch

Danach wird das fertige `UiBoard` zurückgegeben.

## Rendering-Flow in `app.js`

1. `naddr` dekodieren
2. NDK verbinden (`explicitRelayUrls`)
3. `buildBoardFromNostr(ndk, pubkey, identifier)` aufrufen
4. `renderBoardMeta(board)` für Titel/Beschreibung
5. `renderBoard(board)` für Spalten/Karten/Kommentare

Wenn `buildBoardFromNostr` `null` liefert, zeigt die UI „nicht gefunden oder gelöscht“.

## Kinds-Übersicht

- `30301` Board-Basis
- `30302` Karten
- `8571` Patches
- `1` Kommentare
- `5` Löschungen

## Hinweise für Integratoren

- Nutze den Flow als Blaupause für SSR oder Framework-Integrationen.
- Trenne Datenrekonstruktion (`buildBoardFromNostr`) vom UI-Rendering.
- Für Performance kann Kommentar-Laden parallelisiert oder paginiert werden.

