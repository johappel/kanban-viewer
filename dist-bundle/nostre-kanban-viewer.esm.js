import F from "@nostr-dev-kit/ndk";
import { nip19 as O } from "nostr-tools";
import { marked as z } from "marked";
const M = {
  BOARD: 30301,
  CARD: 30302,
  PATCH: 8571,
  COMMENT: 1,
  DELETE: 5
}, N = (i) => typeof i == "number" ? i * 1e3 : 0, R = (i, t) => {
  const o = [];
  for (let r = 0; r < i.length; r += t) o.push(i.slice(r, r + t));
  return o;
};
async function G(i, t, o) {
  const r = `30301:${t}:${o}`, [d, u, g, $] = await Promise.all([
    i.fetchEvent({
      kinds: [M.BOARD],
      authors: [t],
      "#d": [o]
    }),
    i.fetchEvents({
      kinds: [M.CARD],
      "#a": [r]
    }),
    i.fetchEvents({
      kinds: [M.PATCH],
      "#a": [r]
    }),
    i.fetchEvents({
      kinds: [M.PATCH],
      "#d": [o]
    })
  ]);
  if (!d) return null;
  const b = d.tags.find((e) => e[0] === "title")?.[1] || "Unnamed board", H = d.tags.find((e) => e[0] === "description")?.[1] || "", L = d.tags.filter((e) => e[0] === "col").map((e) => ({
    id: e[1],
    name: e[2] || "Column",
    color: e[4] || void 0,
    cards: []
  })).sort((e, n) => {
    const a = d.tags.find((s) => s[0] === "col" && s[1] === e.id), l = d.tags.find((s) => s[0] === "col" && s[1] === n.id);
    return Number(a?.[3] ?? 0) - Number(l?.[3] ?? 0);
  }), m = {
    id: o,
    owner: t,
    name: b,
    description: H,
    columns: L
  }, w = new Map(m.columns.map((e) => [e.id, e]));
  for (const e of u) {
    const n = e.tags.find((f) => f[0] === "d")?.[1], a = e.tags.find((f) => f[0] === "s")?.[1], l = e.tags.find((f) => f[0] === "title")?.[1] || "Untitled", s = e.tags.find((f) => f[0] === "description")?.[1] || e.content || "", c = e.tags.find((f) => f[0] === "rank")?.[1], h = c !== void 0 ? Number(c) : void 0;
    if (!n || !a) continue;
    const E = w.get(a);
    E && E.cards.push({
      id: n,
      heading: l,
      content: s,
      author: e.pubkey,
      rank: Number.isFinite(h) ? h : void 0,
      eventId: e.id,
      comments: []
    });
  }
  const k = /* @__PURE__ */ new Map();
  for (const e of [...g, ...$])
    e?.id && k.set(e.id, e);
  const S = [...k.values()].sort((e, n) => {
    const a = Number(e.tags.find((s) => s[0] === "updated_at_ms")?.[1] || 0) || N(e.created_at), l = Number(n.tags.find((s) => s[0] === "updated_at_ms")?.[1] || 0) || N(n.created_at);
    return a - l;
  });
  for (const e of S) {
    const n = e.tags || [];
    for (const c of n.filter((h) => h[0] === "col")) {
      const [, h, E, f] = c, p = w.get(h);
      p && (E && (p.name = E), f && (p.color = f));
    }
    const a = new Set(n.filter((c) => c[0] === "del").map((c) => c[1]));
    if (a.size > 0) {
      m.columns = m.columns.filter((c) => !a.has(c.id));
      for (const c of a) w.delete(c);
    }
    const l = new Set(n.filter((c) => c[0] === "del-card").map((c) => c[1]));
    if (l.size > 0)
      for (const c of m.columns)
        c.cards = c.cards.filter((h) => !l.has(h.id));
    const s = n.find((c) => c[0] === "order");
    if (s && s.length > 1) {
      const c = s.slice(1), h = new Map(m.columns.map((p) => [p.id, p])), E = c.map((p) => h.get(p)).filter(Boolean), f = m.columns.filter((p) => !c.includes(p.id));
      m.columns = [...E, ...f];
    }
  }
  const _ = m.columns.flatMap((e) => e.cards), j = new Map(
    _.map((e) => [e.id, `30302:${e.author || t}:${e.id}`])
  ), D = [`30301:${t}:${o}`, ...j.values()], K = R(D, 100), x = await Promise.all(
    K.map(
      (e) => i.fetchEvents({
        kinds: [M.DELETE],
        "#a": e
      })
    )
  ), C = /* @__PURE__ */ new Map();
  for (const e of x)
    for (const n of e)
      n?.id && C.set(n.id, n);
  for (const e of C.values()) {
    const n = (e.tags || []).filter((a) => a[0] === "a").map((a) => a[1]);
    for (const a of n)
      if (a) {
        if (a === `30301:${t}:${o}`) return null;
        if (a.startsWith("30302:")) {
          const l = a.split(":").slice(2).join(":");
          for (const s of m.columns)
            s.cards = s.cards.filter((c) => c.id !== l);
        }
      }
  }
  const T = m.columns.flatMap((e) => e.cards).map(
    (e) => `30302:${e.author || t}:${e.id}`
  ), A = new Map(T.map((e) => [e, []])), I = R(T, 100), U = await Promise.all(
    I.map(
      (e) => i.fetchEvents({
        kinds: [M.COMMENT],
        "#a": e
      })
    )
  );
  for (const e of U)
    for (const n of e) {
      const a = (n.tags || []).filter((s) => s[0] === "a").map((s) => s[1]).filter(Boolean), l = {
        id: n.id || `comment-${n.created_at || 0}`,
        text: n.content || "",
        author: n.pubkey,
        createdAt: n.created_at
      };
      for (const s of a)
        A.has(s) && A.get(s).push(l);
    }
  for (const e of m.columns)
    for (const n of e.cards) {
      const a = `30302:${n.author || t}:${n.id}`;
      n.comments = (A.get(a) || []).sort(
        (l, s) => (l.createdAt || 0) - (s.createdAt || 0)
      );
    }
  for (const e of m.columns)
    e.cards.sort((n, a) => {
      const l = n.rank ?? Number.MAX_SAFE_INTEGER, s = a.rank ?? Number.MAX_SAFE_INTEGER;
      return l !== s ? l - s : (n.eventId || "").localeCompare(a.eventId || "");
    });
  return m;
}
const v = (i) => String(i || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"), V = (i) => String(i || "").replaceAll("+++", "").trim(), X = (i) => {
  const t = String(i || "");
  return t ? t.length <= 16 ? t : `${t.slice(0, 8)}...${t.slice(-8)}` : "unbekannt";
}, B = (i) => z.parse(V(i), { breaks: !0 });
function y(i) {
  const t = String(i || "");
  return t ? `<a href="https://njump.me/${encodeURIComponent(t)}" target="_blank" rel="noopener noreferrer">${v(X(t))}</a>` : "unbekannt";
}
class Q {
  constructor({ boardElement: t, boardMetaElement: o = null, statusElement: r = null } = {}) {
    if (!t)
      throw new Error("KanbanBoardViewer requires `boardElement`.");
    this.boardElement = t, this.boardMetaElement = o, this.statusElement = r;
  }
  setStatus(t, o = !1) {
    this.statusElement && (this.statusElement.textContent = t, this.statusElement.style.color = o ? "#b42318" : "#667085");
  }
  decodeNaddr(t) {
    const o = O.decode(t);
    if (!o || o.type !== "naddr") throw new Error("Ungueltige naddr.");
    const r = o.data || {};
    if (r.kind !== 30301) throw new Error(`naddr ist Kind ${r.kind}, erwartet 30301.`);
    if (!r.pubkey || !r.identifier) throw new Error("naddr ohne pubkey oder identifier.");
    return r;
  }
  async load({ naddr: t, relays: o = [] }) {
    const r = this.decodeNaddr(t), d = [.../* @__PURE__ */ new Set([...o || [], ...r.relays || []])].filter(Boolean);
    if (!d.length) throw new Error("Mindestens ein Relay wird benoetigt.");
    this.setStatus("Lade Board...");
    const u = new F({ explicitRelayUrls: d });
    await u.connect();
    const g = await G(u, r.pubkey, r.identifier);
    if (!g) throw new Error("Board nicht gefunden oder geloescht.");
    return this.render(g), this.setStatus(`Board geladen: ${g.name}`), g;
  }
  render(t) {
    this.renderMeta(t), this.renderColumns(t);
  }
  renderMeta(t) {
    this.boardMetaElement && (this.boardMetaElement.innerHTML = "", this.boardMetaElement.insertAdjacentHTML(
      "beforeend",
      `<h2>${v(t.name)}</h2><div class="card-content">${B(t.description || "Keine Beschreibung")}</div>`
    ));
  }
  renderColumns(t) {
    if (this.boardElement.innerHTML = "", !t.columns.length) {
      this.boardElement.innerHTML = '<div class="empty">Board hat keine Spalten.</div>';
      return;
    }
    for (const o of t.columns) {
      const r = document.createElement("article");
      r.className = "column", o.color && (r.style.borderTop = `4px solid ${o.color}`), r.insertAdjacentHTML(
        "beforeend",
        `<div class="column-header"><h3>${v(o.name)}</h3><span class="column-count">${o.cards.length} Karten</span></div>`
      ), o.cards.length || r.insertAdjacentHTML("beforeend", '<div class="empty">Keine Karten</div>');
      for (const d of o.cards) {
        const u = document.createElement("div");
        u.className = "card", u.insertAdjacentHTML("beforeend", `<h4>${v(d.heading)}</h4>`), d.content && u.insertAdjacentHTML(
          "beforeend",
          `<div class="card-content">${B(d.content)}</div>`
        );
        const g = d.rank !== void 0 ? ` | Rank: ${d.rank}` : "";
        if (u.insertAdjacentHTML(
          "beforeend",
          `<div class="card-meta">Autor: ${y(d.author)}${g}</div>`
        ), d.comments?.length) {
          const $ = d.comments.map((b) => `<div class="comment">${y(b.author)}: ${v(b.text)}</div>`).join("");
          u.insertAdjacentHTML("beforeend", `<div class="comments">${$}</div>`);
        }
        r.appendChild(u);
      }
      this.boardElement.appendChild(r);
    }
  }
}
export {
  Q as KanbanBoardViewer,
  G as buildBoardFromNostr
};
