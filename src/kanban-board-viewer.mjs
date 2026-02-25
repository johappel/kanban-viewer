import NDK from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";
import { marked } from "marked";
import { buildBoardFromNostr } from "./build-board-from-nostr.mjs";

const escapeHtml = (s) =>
  String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const normalizeMarkdown = (text) => String(text || "").replaceAll("+++", "").trim();
const shortPubkey = (pubkey) => {
  const value = String(pubkey || "");
  if (!value) return "unbekannt";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
};

const renderMarkdown = (text) => marked.parse(normalizeMarkdown(text), { breaks: true });

function createAuthorLink(pubkey) {
  const value = String(pubkey || "");
  if (!value) return "unbekannt";
  return `<a href="https://njump.me/${encodeURIComponent(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortPubkey(value))}</a>`;
}

export class KanbanBoardViewer {
  constructor({ boardElement, boardMetaElement = null, statusElement = null } = {}) {
    if (!boardElement) {
      throw new Error("KanbanBoardViewer requires `boardElement`.");
    }
    this.boardElement = boardElement;
    this.boardMetaElement = boardMetaElement;
    this.statusElement = statusElement;
  }

  setStatus(text, isError = false) {
    if (!this.statusElement) return;
    this.statusElement.textContent = text;
    this.statusElement.style.color = isError ? "#b42318" : "#667085";
  }

  decodeNaddr(naddr) {
    const decoded = nip19.decode(naddr);
    if (!decoded || decoded.type !== "naddr") throw new Error("Ungueltige naddr.");
    const data = decoded.data || {};
    if (data.kind !== 30301) throw new Error(`naddr ist Kind ${data.kind}, erwartet 30301.`);
    if (!data.pubkey || !data.identifier) throw new Error("naddr ohne pubkey oder identifier.");
    return data;
  }

  async load({ naddr, relays = [] }) {
    const naddrData = this.decodeNaddr(naddr);
    const relayUrls = [...new Set([...(relays || []), ...(naddrData.relays || [])])].filter(Boolean);
    if (!relayUrls.length) throw new Error("Mindestens ein Relay wird benoetigt.");

    this.setStatus("Lade Board...");
    const ndk = new NDK({ explicitRelayUrls: relayUrls });
    await ndk.connect();

    const board = await buildBoardFromNostr(ndk, naddrData.pubkey, naddrData.identifier);
    if (!board) throw new Error("Board nicht gefunden oder geloescht.");
    this.render(board);
    this.setStatus(`Board geladen: ${board.name}`);
    return board;
  }

  render(board) {
    this.renderMeta(board);
    this.renderColumns(board);
  }

  renderMeta(board) {
    if (!this.boardMetaElement) return;
    this.boardMetaElement.innerHTML = "";
    this.boardMetaElement.insertAdjacentHTML(
      "beforeend",
      `<h2>${escapeHtml(board.name)}</h2><div class="card-content">${renderMarkdown(board.description || "Keine Beschreibung")}</div>`
    );
  }

  renderColumns(board) {
    this.boardElement.innerHTML = "";
    if (!board.columns.length) {
      this.boardElement.innerHTML = `<div class="empty">Board hat keine Spalten.</div>`;
      return;
    }

    for (const column of board.columns) {
      const columnEl = document.createElement("article");
      columnEl.className = "column";
      if (column.color) columnEl.style.borderTop = `4px solid ${column.color}`;
      columnEl.insertAdjacentHTML(
        "beforeend",
        `<div class="column-header"><h3>${escapeHtml(column.name)}</h3><span class="column-count">${column.cards.length} Karten</span></div>`
      );

      if (!column.cards.length) {
        columnEl.insertAdjacentHTML("beforeend", `<div class="empty">Keine Karten</div>`);
      }

      for (const card of column.cards) {
        const cardEl = document.createElement("div");
        cardEl.className = "card";
        cardEl.insertAdjacentHTML("beforeend", `<h4>${escapeHtml(card.heading)}</h4>`);
        if (card.content) {
          cardEl.insertAdjacentHTML(
            "beforeend",
            `<div class="card-content">${renderMarkdown(card.content)}</div>`
          );
        }
        const rankText = card.rank !== undefined ? ` | Rank: ${card.rank}` : "";
        cardEl.insertAdjacentHTML(
          "beforeend",
          `<div class="card-meta">Autor: ${createAuthorLink(card.author)}${rankText}</div>`
        );
        if (card.comments?.length) {
          const commentsHtml = card.comments
            .map((c) => `<div class="comment">${createAuthorLink(c.author)}: ${escapeHtml(c.text)}</div>`)
            .join("");
          cardEl.insertAdjacentHTML("beforeend", `<div class="comments">${commentsHtml}</div>`);
        }
        columnEl.appendChild(cardEl);
      }

      this.boardElement.appendChild(columnEl);
    }
  }
}
