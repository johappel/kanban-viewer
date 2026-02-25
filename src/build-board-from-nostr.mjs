const KINDS = {
  BOARD: 30301,
  CARD: 30302,
  PATCH: 8571,
  COMMENT: 1,
  DELETE: 5,
};

const asMs = (value) => (typeof value === "number" ? value * 1000 : 0);
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function buildBoardFromNostr(ndk, ownerPubkey, boardId) {
  const boardRef = `30301:${ownerPubkey}:${boardId}`;

  const [boardEvent, cardEvents, patchByA, patchByD] = await Promise.all([
    ndk.fetchEvent({
      kinds: [KINDS.BOARD],
      authors: [ownerPubkey],
      "#d": [boardId],
    }),
    ndk.fetchEvents({
      kinds: [KINDS.CARD],
      "#a": [boardRef],
    }),
    ndk.fetchEvents({
      kinds: [KINDS.PATCH],
      "#a": [boardRef],
    }),
    ndk.fetchEvents({
      kinds: [KINDS.PATCH],
      "#d": [boardId],
    }),
  ]);

  if (!boardEvent) return null;

  const title = boardEvent.tags.find((t) => t[0] === "title")?.[1] || "Unnamed board";
  const description = boardEvent.tags.find((t) => t[0] === "description")?.[1] || "";

  const columns = boardEvent.tags
    .filter((t) => t[0] === "col")
    .map((t) => ({
      id: t[1],
      name: t[2] || "Column",
      color: t[4] || undefined,
      cards: [],
    }))
    .sort((a, b) => {
      const ta = boardEvent.tags.find((t) => t[0] === "col" && t[1] === a.id);
      const tb = boardEvent.tags.find((t) => t[0] === "col" && t[1] === b.id);
      return Number(ta?.[3] ?? 0) - Number(tb?.[3] ?? 0);
    });

  const board = {
    id: boardId,
    owner: ownerPubkey,
    name: title,
    description,
    columns,
  };

  const columnById = new Map(board.columns.map((c) => [c.id, c]));

  for (const event of cardEvents) {
    const d = event.tags.find((t) => t[0] === "d")?.[1];
    const s = event.tags.find((t) => t[0] === "s")?.[1];
    const heading = event.tags.find((t) => t[0] === "title")?.[1] || "Untitled";
    const content = event.tags.find((t) => t[0] === "description")?.[1] || event.content || "";
    const rankRaw = event.tags.find((t) => t[0] === "rank")?.[1];
    const rank = rankRaw !== undefined ? Number(rankRaw) : undefined;

    if (!d || !s) continue;
    const col = columnById.get(s);
    if (!col) continue;

    col.cards.push({
      id: d,
      heading,
      content,
      author: event.pubkey,
      rank: Number.isFinite(rank) ? rank : undefined,
      eventId: event.id,
      comments: [],
    });
  }

  const patchMap = new Map();
  for (const e of [...patchByA, ...patchByD]) {
    if (e?.id) patchMap.set(e.id, e);
  }

  const patches = [...patchMap.values()].sort((a, b) => {
    const aMs =
      Number(a.tags.find((t) => t[0] === "updated_at_ms")?.[1] || 0) || asMs(a.created_at);
    const bMs =
      Number(b.tags.find((t) => t[0] === "updated_at_ms")?.[1] || 0) || asMs(b.created_at);
    return aMs - bMs;
  });

  for (const patch of patches) {
    const tags = patch.tags || [];

    for (const t of tags.filter((x) => x[0] === "col")) {
      const [, colId, name, color] = t;
      const col = columnById.get(colId);
      if (!col) continue;
      if (name) col.name = name;
      if (color) col.color = color;
    }

    const deletedCols = new Set(tags.filter((x) => x[0] === "del").map((x) => x[1]));
    if (deletedCols.size > 0) {
      board.columns = board.columns.filter((c) => !deletedCols.has(c.id));
      for (const id of deletedCols) columnById.delete(id);
    }

    const deletedCards = new Set(tags.filter((x) => x[0] === "del-card").map((x) => x[1]));
    if (deletedCards.size > 0) {
      for (const col of board.columns) {
        col.cards = col.cards.filter((card) => !deletedCards.has(card.id));
      }
    }

    const orderTag = tags.find((x) => x[0] === "order");
    if (orderTag && orderTag.length > 1) {
      const wanted = orderTag.slice(1);
      const byId = new Map(board.columns.map((c) => [c.id, c]));
      const ordered = wanted.map((id) => byId.get(id)).filter(Boolean);
      const rest = board.columns.filter((c) => !wanted.includes(c.id));
      board.columns = [...ordered, ...rest];
    }
  }

  const allCards = board.columns.flatMap((c) => c.cards);
  const cardRefById = new Map(
    allCards.map((card) => [card.id, `30302:${card.author || ownerPubkey}:${card.id}`])
  );
  const deleteRefs = [`30301:${ownerPubkey}:${boardId}`, ...cardRefById.values()];
  const deleteChunks = chunk(deleteRefs, 100);
  const deleteChunkResults = await Promise.all(
    deleteChunks.map((refs) =>
      ndk.fetchEvents({
        kinds: [KINDS.DELETE],
        "#a": refs,
      })
    )
  );
  const deleteMap = new Map();
  for (const events of deleteChunkResults) {
    for (const e of events) {
      if (e?.id) deleteMap.set(e.id, e);
    }
  }

  for (const event of deleteMap.values()) {
    const aTags = (event.tags || []).filter((t) => t[0] === "a").map((t) => t[1]);
    for (const ref of aTags) {
      if (!ref) continue;
      if (ref === `30301:${ownerPubkey}:${boardId}`) return null;
      if (ref.startsWith("30302:")) {
        const cardId = ref.split(":").slice(2).join(":");
        for (const col of board.columns) {
          col.cards = col.cards.filter((c) => c.id !== cardId);
        }
      }
    }
  }

  const remainingCards = board.columns.flatMap((c) => c.cards);
  const remainingCardRefs = remainingCards.map(
    (card) => `30302:${card.author || ownerPubkey}:${card.id}`
  );
  const commentsByCardRef = new Map(remainingCardRefs.map((ref) => [ref, []]));
  const commentChunks = chunk(remainingCardRefs, 100);
  const commentResults = await Promise.all(
    commentChunks.map((refs) =>
      ndk.fetchEvents({
        kinds: [KINDS.COMMENT],
        "#a": refs,
      })
    )
  );

  for (const events of commentResults) {
    for (const e of events) {
      const refs = (e.tags || []).filter((t) => t[0] === "a").map((t) => t[1]).filter(Boolean);
      const comment = {
        id: e.id || `comment-${e.created_at || 0}`,
        text: e.content || "",
        author: e.pubkey,
        createdAt: e.created_at,
      };
      for (const ref of refs) {
        if (commentsByCardRef.has(ref)) commentsByCardRef.get(ref).push(comment);
      }
    }
  }

  for (const col of board.columns) {
    for (const card of col.cards) {
      const cardRef = `30302:${card.author || ownerPubkey}:${card.id}`;
      card.comments = (commentsByCardRef.get(cardRef) || []).sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
    }
  }

  for (const col of board.columns) {
    col.cards.sort((a, b) => {
      const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
      const br = b.rank ?? Number.MAX_SAFE_INTEGER;
      if (ar !== br) return ar - br;
      return (a.eventId || "").localeCompare(b.eventId || "");
    });
  }

  return board;
}
