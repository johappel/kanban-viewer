import { buildBoardFromNostr } from "./boardFromNostr.js";

const statusEl = document.getElementById("status");
const boardMetaEl = document.getElementById("boardMeta");
const boardEl = document.getElementById("board");

const naddrInput = document.getElementById("naddr");
const relaysInput = document.getElementById("relays");
const loadBtn = document.getElementById("loadBtn");

let depsPromise;
async function loadDeps() {
  if (depsPromise) return depsPromise;

  depsPromise = (async () => {
    try {
      const [ndkMod, nostrTools] = await Promise.all([
        import("@nostr-dev-kit/ndk"),
        import("nostr-tools"),
      ]);
      return {
        NDK: ndkMod.default,
        nip19: nostrTools.nip19,
      };
    } catch (err) {
      throw new Error(
        `Lokale Abhaengigkeiten konnten nicht geladen werden: ${err?.message || err}. Starte die App mit 'npm run dev' und oeffne die Vite-URL.`
      );
    }
  })();

  return depsPromise;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.style.color = isError ? "#b42318" : "#667085";
}

function renderBoardMeta(board) {
  boardMetaEl.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = board.name;
  const desc = document.createElement("p");
  desc.textContent = board.description || "Keine Beschreibung";
  boardMetaEl.appendChild(title);
  boardMetaEl.appendChild(desc);
}

function renderBoard(board) {
  boardEl.innerHTML = "";

  if (!board.columns.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Board hat keine Spalten.";
    boardEl.appendChild(empty);
    return;
  }

  for (const column of board.columns) {
    const colEl = document.createElement("article");
    colEl.className = "column";
    if (column.color) colEl.style.borderTop = `4px solid ${column.color}`;

    const header = document.createElement("div");
    header.className = "column-header";

    const title = document.createElement("h3");
    title.textContent = column.name;

    const count = document.createElement("span");
    count.className = "column-count";
    count.textContent = `${column.cards.length} Karten`;

    header.appendChild(title);
    header.appendChild(count);
    colEl.appendChild(header);

    if (!column.cards.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Keine Karten";
      colEl.appendChild(empty);
    }

    for (const card of column.cards) {
      const cardEl = document.createElement("div");
      cardEl.className = "card";

      const heading = document.createElement("h4");
      heading.textContent = card.heading;
      cardEl.appendChild(heading);

      if (card.content) {
        const content = document.createElement("p");
        content.textContent = card.content;
        cardEl.appendChild(content);
      }

      const meta = document.createElement("div");
      meta.className = "card-meta";
      meta.textContent = `Autor: ${card.author || "unbekannt"}${card.rank !== undefined ? ` | Rank: ${card.rank}` : ""}`;
      cardEl.appendChild(meta);

      if (card.comments?.length) {
        const commentsEl = document.createElement("div");
        commentsEl.className = "comments";
        for (const comment of card.comments) {
          const c = document.createElement("div");
          c.className = "comment";
          c.textContent = `${comment.author}: ${comment.text}`;
          commentsEl.appendChild(c);
        }
        cardEl.appendChild(commentsEl);
      }

      colEl.appendChild(cardEl);
    }

    boardEl.appendChild(colEl);
  }
}

async function createNdk(relayUrls) {
  const { NDK } = await loadDeps();
  const ndk = new NDK({ explicitRelayUrls: relayUrls });
  await ndk.connect();
  return ndk;
}

async function decodeNaddr(naddr) {
  const { nip19 } = await loadDeps();
  const decoded = nip19.decode(naddr);

  if (!decoded || decoded.type !== "naddr") {
    throw new Error("Ungueltige naddr.");
  }

  const data = decoded.data || {};
  if (data.kind !== 30301) {
    throw new Error(`naddr ist Kind ${data.kind}, erwartet wird 30301 (Board).`);
  }
  if (!data.pubkey || !data.identifier) {
    throw new Error("naddr enthaelt keinen pubkey oder identifier.");
  }

  return data;
}

loadBtn.addEventListener("click", async () => {
  const naddr = naddrInput.value.trim();
  const relayUrlsFromInput = relaysInput.value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  if (!naddr) {
    setStatus("Bitte eine naddr angeben.", true);
    return;
  }
  if (!relayUrlsFromInput.length) {
    setStatus("Bitte mindestens eine Relay-URL angeben.", true);
    return;
  }

  try {
    setStatus("Dekodiere naddr, verbinde zu Relays und lade Board...");
    boardEl.innerHTML = "";
    boardMetaEl.innerHTML = "";

    const naddrData = await decodeNaddr(naddr);
    const relayUrls = [...new Set([...relayUrlsFromInput, ...(naddrData.relays || [])])];

    const ndk = await createNdk(relayUrls);
    const board = await buildBoardFromNostr(ndk, naddrData.pubkey, naddrData.identifier);
    if (!board) {
      setStatus("Board nicht gefunden oder geloescht.", true);
      return;
    }

    renderBoardMeta(board);
    renderBoard(board);
    setStatus(`Board geladen: ${board.name}`);
  } catch (err) {
    console.error(err);
    setStatus(`Fehler beim Laden: ${err?.message || err}`, true);
  }
});
