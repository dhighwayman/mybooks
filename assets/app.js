// La biblioteca de David: pilas interactivas a partir de data/library.json

const GENRE_ES = {
  "Thriller": "Thriller", "Mystery": "Misterio", "Crime": "Novela negra", "Mystery Thriller": "Thriller de misterio",
  "Suspense": "Suspense", "Psychological Thriller": "Thriller psicológico", "Fiction": "Ficción", "Fantasy": "Fantasía",
  "Science Fiction": "Ciencia ficción", "Historical Fiction": "Ficción histórica", "Historical": "Histórica", "Horror": "Terror",
  "Classics": "Clásicos", "Young Adult": "Juvenil", "Spanish Literature": "Literatura española", "Nonfiction": "No ficción",
  "Business": "Empresa", "Dystopia": "Distopía", "Humor": "Humor", "Adventure": "Aventura", "Magic": "Magia",
  "Childrens": "Infantil", "Middle Grade": "Middle grade", "Philosophy": "Filosofía", "Politics": "Política",
  "Romance": "Romance", "Contemporary": "Contemporánea", "Literary Fiction": "Ficción literaria", "Detective": "Detectives",
  "Police": "Policíaca", "Gothic": "Gótica", "Vampires": "Vampiros", "Paranormal": "Paranormal", "Religion": "Religión",
  "Art": "Arte", "History": "Historia", "Short Stories": "Relatos", "European Literature": "Literatura europea",
  "German Literature": "Literatura alemana", "Espionage": "Espionaje", "Spy Thriller": "Espionaje", "Cyberpunk": "Cyberpunk",
  "Video Games": "Videojuegos", "Post Apocalyptic": "Postapocalíptica", "Apocalyptic": "Apocalíptica", "Russia": "Rusia",
  "Russian Literature": "Literatura rusa", "Audiobook": "Audiolibro", "Novels": "Novela", "Literature": "Literatura",
  "Science Fiction Fantasy": "Fantasía y ciencia ficción", "Urban Fantasy": "Fantasía urbana", "High Fantasy": "Alta fantasía",
  "Epic Fantasy": "Fantasía épica", "Management": "Gestión", "Self Help": "Autoayuda", "Psychology": "Psicología",
  "Economics": "Economía", "Legal Thriller": "Thriller legal", "Crime Fiction": "Novela negra", "Murder Mystery": "Asesinatos",
  "Serial Killers": "Asesinos en serie", "Medieval": "Medieval", "Architecture": "Arquitectura", "Spain": "España",
  "Italian Literature": "Literatura italiana", "Nordic Noir": "Nórdica", "True Crime": "True crime", "Drama": "Drama",
  "Family": "Familia", "Mental Health": "Salud mental", "Terrorism": "Terrorismo", "Space": "Espacio", "Comedy": "Comedia",
  "Adult": "Adultos", "Book Club": "Club de lectura", "Hackers": "Hackers", "Technology": "Tecnología", "Cults": "Sectas",
  "War": "Guerra", "Military Fiction": "Ficción militar", "Action": "Acción", "Conspiracy Theories": "Conspiraciones",
  "Pirates": "Piratas", "Nautical": "Náutica", "Sports": "Deportes", "Biography": "Biografía", "Memoir": "Memorias",
};
const GENERIC = new Set(["Fiction", "Audiobook", "Novels", "Adult", "Adult Fiction", "Literature", "Book Club", "Contemporary", "Spain"]);
const SPINES = ["#7a2e22", "#1f4a44", "#2b3a5c", "#8a5a1c", "#4d2a4a", "#355b2c", "#6b3b1f", "#23404f", "#7b4b2a", "#3f3a2c", "#5c1f2f", "#2f4f3a"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const genreEs = (g) => GENRE_ES[g] || g;
const num = (n) => new Intl.NumberFormat("es-ES").format(n);
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many}`;

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rand(seed) { // determinista: la misma pila siempre se apila igual
  let x = hash(seed) || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0) / 4294967296;
}
const spineOf = (key) => SPINES[hash(key) % SPINES.length];
const coverUrl = (url, size = 300) => (url ? url.replace(/(\.\w+)$/, `._SY${size}_$1`) : null);
const grUrl = (item) => `https://www.goodreads.com/book/show/${item.bookId}`;

// ------------------------------------------------------------------ modelo

let DATA;
const items = new Map(); // key → libro (propio, faltante o recomendado)
const piles = new Map(); // "tipo:id" → pila
let ownedWorks = new Set();
let ownedAuthorIds = new Set();

function makeOwned(b) {
  const status = b.shelf === "read" ? "read" : b.shelf === "currently-reading" ? "reading" : "pending";
  const it = { ...b, key: `b${b.bookId}`, status, spine: spineOf(b.bookId) };
  items.set(it.key, it);
  return it;
}
function makeOther(s, status, extra = {}) {
  const key = `${status[0]}${s.workId || s.bookId}`;
  if (items.has(key)) return Object.assign(items.get(key), extra);
  const it = { ...s, ...extra, key, status, spine: spineOf(s.bookId || s.title) };
  items.set(key, it);
  return it;
}

function topGenres(b, n = 3) {
  return (b.genres || []).filter((g) => !GENERIC.has(g)).slice(0, n);
}

function buildModel() {
  const owned = DATA.books.map(makeOwned);
  const byBook = new Map(owned.map((b) => [b.bookId, b]));
  ownedWorks = new Set(owned.map((b) => b.workId).filter(Boolean));
  ownedAuthorIds = new Set(owned.map((b) => b.authorId));

  // Series
  const seriesPiles = [];
  for (const s of DATA.series) {
    const entries = s.entries.map((e) => {
      if (e.bookId) return { position: e.position, item: byBook.get(e.bookId) };
      return { position: e.position, item: makeOther(e.suggestion, "missing", { position: e.position }) };
    }).filter((e) => e.item);
    const mine = entries.filter((e) => e.item.status !== "missing");
    if (!mine.length) continue;
    const read = mine.filter((e) => e.item.status === "read").length;
    const pile = {
      kind: "serie", id: s.id, title: s.title, url: s.url, entries,
      stack: mine.map((e) => e.item),
      missing: entries.filter((e) => e.item.status === "missing").map((e) => e.item),
      authors: [...new Set(entries.map((e) => e.item.author).filter(Boolean))],
      read, total: entries.length,
    };
    pile.sub = `${read} de ${pile.total} leídos`;
    seriesPiles.push(pile);
    piles.set(`serie:${s.id}`, pile);
  }

  // Autores
  const authorPiles = [];
  const mergedAuthors = new Map();
  for (const a of DATA.authors) {
    const prev = mergedAuthors.get(a.id);
    if (prev) { prev.bookIds.push(...a.bookIds); prev.suggestions.push(...a.suggestions); if (!/^\d+$/.test(prev.authorId)) prev.authorId = a.authorId; }
    else mergedAuthors.set(a.id, { ...a, bookIds: [...a.bookIds], suggestions: [...a.suggestions] });
  }
  for (const a of mergedAuthors.values()) {
    const mine = a.bookIds.map((id) => byBook.get(id)).filter(Boolean);
    const inSeries = seriesPiles.filter((sp) => sp.stack.some((b) => b.authorId === a.authorId));
    const missing = [];
    const seen = new Set(ownedWorks);
    for (const sp of inSeries) for (const m of sp.missing) if (m.authorId === a.authorId && !seen.has(m.workId)) { seen.add(m.workId); missing.push(m); }
    for (const s of a.suggestions) if (!seen.has(s.workId)) { seen.add(s.workId); missing.push(makeOther(s, "missing")); }
    const read = mine.filter((b) => b.status === "read").length;
    const pending = mine.length - read;
    const pile = {
      kind: "autor", id: a.id, title: a.name, authorId: a.authorId, image: a.image,
      stack: mine, mine, missing, series: inSeries, read, pending,
      sub: [read && plural(read, "leído", "leídos"), pending && plural(pending, "pendiente", "pendientes")].filter(Boolean).join(" · "),
    };
    authorPiles.push(pile);
    piles.set(`autor:${a.id}`, pile);
  }

  // Géneros (un libro puede estar en varias pilas)
  const genreMap = new Map();
  for (const b of owned) for (const g of topGenres(b)) {
    if (!genreMap.has(g)) genreMap.set(g, []);
    genreMap.get(g).push(b);
  }
  const genrePiles = [];
  for (const [g, list] of genreMap) {
    if (list.length < 2) continue;
    const pile = { kind: "genero", id: slug(g), genre: g, title: genreEs(g), stack: list, mine: list, sub: plural(list.length, "libro", "libros") };
    genrePiles.push(pile);
    piles.set(`genero:${pile.id}`, pile);
  }

  // Recomendaciones → pilas nuevas
  const recs = DATA.recommendations.filter((r) => !ownedWorks.has(r.workId)).map((r) => makeOther(r, "rec"));
  const recPiles = { autores: [], series: [], generos: [], parati: [] };
  const addRec = (mode, id, title, sub, list, why, max = 12) => {
    const uniq = [...new Map(list.map((x) => [x.workId, x])).values()].slice(0, max);
    if (uniq.length < 3) return;
    const pile = { kind: "pila", id, title, sub, why, stack: uniq, recs: uniq, rec: true };
    piles.set(`pila:${id}`, pile);
    recPiles[mode].push(pile);
    return pile;
  };

  addRec("parati", "para-ti", "Elegidos para ti", "Lo que más encaja con todo lo que has leído", recs, "Cruzando los «lectores también disfrutaron» de tus 89 libros.", 16);
  addRec("parati", "autores-nuevos", "Autores nuevos", "Voces que todavía no has leído", recs.filter((r) => !ownedAuthorIds.has(r.authorId)), "Autores que no tienes en tu biblioteca y que gustan a quien lee lo mismo que tú.", 16);

  const next = [];
  for (const sp of seriesPiles) {
    const nxt = sp.entries.find((e) => e.item.status !== "read" && Number(e.position) > Math.min(...sp.entries.filter((x) => x.item.status === "read").map((x) => Number(x.position) || 0)));
    if (nxt && sp.read) next.push(nxt.item);
  }
  const contin = next.length >= 2 ? { kind: "pila", id: "continua", title: "Continúa tus series", sub: "El siguiente libro de cada serie empezada", why: "El primer libro sin leer de cada serie que ya has empezado.", stack: next, recs: next, rec: true } : null;
  if (contin) { piles.set("pila:continua", contin); recPiles.series.push(contin); recPiles.parati.push(contin); }

  const starts = recs.filter((r) => (r.series || []).some((s) => s.position === "1"));
  const startPile = addRec("series", "series-para-empezar", "Series para empezar", "Primeros libros de sagas que te pueden enganchar", starts, "Primeras entregas de series que gustan a lectores como tú.", 14);
  if (startPile) recPiles.parati.push(startPile);

  const authorsByReads = authorPiles.filter((p) => p.read >= 2).sort((a, b) => b.read - a.read).slice(0, 8);
  for (const ap of authorsByReads) {
    const mineIds = new Set(ap.mine.map((b) => b.bookId));
    const list = recs.filter((r) => r.authorId !== ap.authorId && (r.because || []).some((id) => mineIds.has(id)));
    const p = addRec("autores", `como-${ap.id}`, `Si te gusta ${ap.title}`, "Para leer después", list, `Libros que suelen gustar a quien disfruta de ${ap.title}.`, 10);
    if (p) { p.basedOn = ap; if (recPiles.parati.length < 12) recPiles.parati.push(p); }
  }

  const genresByCount = genrePiles.sort((a, b) => b.stack.length - a.stack.length).slice(0, 7);
  for (const gp of genresByCount) {
    const list = recs.filter((r) => topGenres(r, 4).includes(gp.genre));
    const p = addRec("generos", `mas-${gp.id}`, `Más ${gp.title.toLowerCase()}`, `Porque tienes ${gp.stack.length} libros de ${gp.title.toLowerCase()}`, list, `Recomendaciones de ${gp.title.toLowerCase()} a partir de tus lecturas.`, 10);
    if (p) { p.basedOn = gp; if (recPiles.parati.length < 16) recPiles.parati.push(p); }
  }

  return { owned, authorPiles, seriesPiles, genrePiles, recPiles, recs };
}

// ------------------------------------------------------------------ pilas en el suelo

let MODEL;
let state = { mode: "autores", q: "", sort: "size" };

function pileSize(p) { return p.stack.length; }
function pileRecent(p) { return p.stack.reduce((m, b) => (b.dateAdded > m ? b.dateAdded : m), ""); }

function sortPiles(list) {
  const s = [...list];
  if (state.sort === "alpha") s.sort((a, b) => a.title.localeCompare(b.title, "es"));
  else if (state.sort === "recent") s.sort((a, b) => pileRecent(b).localeCompare(pileRecent(a)));
  else s.sort((a, b) => pileSize(b) - pileSize(a) || a.title.localeCompare(b.title, "es"));
  return s;
}

function matches(p) {
  if (!state.q) return true;
  const q = norm(state.q);
  const pool = [p.title, ...(p.stack || []), ...(p.missing || [])].map((x) => (typeof x === "string" ? x : `${x.title} ${x.author}`));
  return pool.some((t) => norm(t).includes(q));
}

function book3d(it, z, t, rnd, isTop, W) {
  const r = (rnd() - 0.5) * 12;
  const dx = (rnd() - 0.5) * 10;
  const dy = (rnd() - 0.5) * 8;
  const cls = ["book3d", it.status === "missing" ? "ghost" : "", isTop ? "is-top" : ""].join(" ");
  const src = coverUrl(it.cover, W > 90 ? 300 : 200);
  return `<div class="${cls}" style="--z:${z}px;--t:${t}px;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--r:${r.toFixed(1)}deg;--spine:${it.spine}">
    <div class="f f-top">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}<div class="fallback">${esc(it.title)}</div></div>
    <div class="f f-front">${esc(it.title)}</div>
    <div class="f f-right"></div>
  </div>`;
}

function pileHTML(p, i) {
  const small = matchMedia("(max-width: 640px)").matches;
  const W = small ? 84 : 104;
  const rnd = rand(p.kind + p.id);
  const stackItems = orderForStack(p).slice(-8);
  let ts = stackItems.map((b) => Math.max(9, Math.min(26, (b.pages || 350) / 22)));
  const total = ts.reduce((a, b) => a + b, 0);
  const cap = small ? 150 : 190;
  if (total > cap) ts = ts.map((t) => t * (cap / total));
  let z = 0;
  const books = stackItems.map((b, idx) => {
    const html = book3d(b, z, ts[idx], rnd, idx === stackItems.length - 1, W);
    z += ts[idx];
    return html;
  }).join("");
  const stageH = Math.round((small ? 88 : 104) + z * 0.86);
  const rz = 16 + rnd() * 20;
  const key = `${p.kind}:${p.id}`;
  let tag = "";
  if (p.rec) tag = `<span class="tag">Nueva pila</span>`;
  else if (p.missing?.length) tag = `<span class="tag missing">te ${p.missing.length === 1 ? "falta" : "faltan"} ${p.missing.length}</span>`;
  const more = p.stack.length > stackItems.length ? ` · +${p.stack.length - stackItems.length} en la pila` : "";
  const bar = p.kind === "serie" ? `<span class="bar" style="--p:${Math.round((p.read / p.total) * 100)}%"><i></i></span>` : "";
  return `<button class="pile ${p.rec ? "rec" : ""}" data-pile="${esc(key)}" style="--i:${i}" aria-label="${esc(`${p.title}: ${p.sub}`)}">
    ${tag}
    <div class="stage" style="--stage-h:${stageH}px"><div class="stack" style="--rz:${rz.toFixed(1)}deg"><div class="shadow"></div>${books}</div></div>
    <div class="pile-label"><strong>${esc(p.title)}</strong><span>${esc(p.sub)}${more}</span>${bar}</div>
  </button>`;
}

function orderForStack(p) {
  // el libro de arriba es el más reciente (o el último de la serie)
  if (p.kind === "serie") return [...p.stack].sort((a, b) => (parseFloat(a.position ?? posOf(p, a)) || 0) - (parseFloat(b.position ?? posOf(p, b)) || 0));
  if (p.rec) {
    // que cada pila nueva muestre arriba una portada distinta
    const top = p.stack.find((b) => !usedTops.has(b.key)) || p.stack[0];
    usedTops.add(top.key);
    return [...p.stack.filter((b) => b !== top).reverse(), top];
  }
  return [...p.stack].sort((a, b) => (a.status === "read") - (b.status === "read") || 0).reverse().sort((a, b) => (a.year || 0) - (b.year || 0));
}
function posOf(p, it) { return p.entries?.find((e) => e.item === it)?.position; }

function section(title, sub, list, cls = "") {
  const shown = list.filter(matches);
  if (!shown.length) return "";
  return `<section class="floor-section ${cls}"><h3>${esc(title)} <small>${esc(sub)}</small></h3>
    <div class="piles">${sortPiles(shown).map((p, i) => pileHTML(p, i)).join("")}</div></section>`;
}

let usedTops = new Set();
function renderFloor() {
  const m = MODEL;
  usedTops = new Set();
  let html = "";
  if (state.mode === "autores") {
    html += section("Tus autores", `${m.authorPiles.length} pilas`, m.authorPiles);
    html += section("Nuevas pilas para ti", "según los autores que más lees", [...m.recPiles.autores, piles.get("pila:autores-nuevos")].filter(Boolean), "recs");
  } else if (state.mode === "series") {
    html += section("Tus series", `${m.seriesPiles.length} sagas empezadas`, m.seriesPiles);
    html += section("Nuevas pilas para ti", "para seguir o empezar", m.recPiles.series, "recs");
  } else if (state.mode === "generos") {
    html += section("Tus géneros", "un libro puede estar en varias pilas", m.genrePiles);
    html += section("Nuevas pilas para ti", "según tus géneros favoritos", m.recPiles.generos, "recs");
  } else {
    html += section("Pilas nuevas", "sugerencias basadas en lo que has leído", m.recPiles.parati, "recs");
    html += section("Te faltan", "de las series y autores que ya lees", m.seriesPiles.filter((p) => p.missing.length).map((p) => ({ ...p })), "");
  }
  $("#floor").innerHTML = html || `<p class="empty">Nada coincide con «${esc(state.q)}».</p>`;
}

// ------------------------------------------------------------------ vista de detalle

function coverHTML(it, opts = {}) {
  const src = coverUrl(it.cover, 475);
  const badge = {
    read: `<span class="badge read">✓ Leído</span>`,
    reading: `<span class="badge pending">Leyendo</span>`,
    pending: `<span class="badge pending">Pendiente</span>`,
    missing: `<span class="badge">Te falta</span>`,
    rec: "",
  }[it.status];
  const numb = opts.position ? `<span class="num">#${esc(opts.position)}</span>` : "";
  const why = opts.why && it.because?.length
    ? `<span class="why">Porque leíste ${it.because.map((id) => items.get(`b${id}`)?.title).filter(Boolean).slice(0, 2).map((t) => `<b>${esc(t)}</b>`).join(" y ")}</span>`
    : "";
  const stars = it.userRating ? `<span class="stars" aria-label="${it.userRating} estrellas">${"★".repeat(it.userRating)}</span>` : "";
  return `<button class="cover-item ${it.status}" data-key="${esc(it.key)}" aria-label="${esc(`${it.title}, ${it.author}`)}">
    <div class="cv" style="--spine:${it.spine}">
      <div class="fallback">${esc(it.title)}<em>${esc(it.author)}</em></div>
      ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}
      ${numb}${badge}
    </div>
    <span class="t">${esc(it.title)}</span>
    <span class="a">${esc(opts.hideAuthor ? [it.year, it.avgRating && `★ ${it.avgRating.toFixed(2)}`].filter(Boolean).join(" · ") : it.author)}</span>
    ${stars}${why}
  </button>`;
}

function shelf(title, count, hint, list, opts = {}) {
  if (!list.length) return "";
  return `<div class="shelf"><h4>${esc(title)} <small>${esc(count ?? "")}</small></h4>${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
    <div class="covers">${list.map((x) => (x.item ? coverHTML(x.item, { ...opts, position: x.position }) : coverHTML(x, opts))).join("")}</div></div>`;
}

function recsFor(bookIds, excludeAuthor, max = 10) {
  const ids = new Set(bookIds);
  return MODEL.recs.filter((r) => r.authorId !== excludeAuthor && (r.because || []).some((id) => ids.has(id))).slice(0, max);
}

function detailContent(p) {
  const chip = (key, label, extra = "") => `<button class="chip" data-go="${esc(key)}">${label}${extra}</button>`;
  if (p.kind === "autor") {
    const read = p.mine.filter((b) => b.status !== "pending");
    const pend = p.mine.filter((b) => b.status === "pending");
    const pages = read.reduce((s, b) => s + (b.pages || 0), 0);
    const similar = piles.get(`pila:como-${p.id}`)?.recs || recsFor(p.mine.map((b) => b.bookId), p.authorId, 8);
    return {
      kicker: "Autor", title: p.title,
      sub: [p.sub, pages && `${num(pages)} páginas`].filter(Boolean).join(" · "),
      body:
        (p.series.length ? `<div class="chips">${p.series.map((s) => chip(`serie:${s.id}`, `Serie <b>${esc(s.title)}</b>`, ` · ${s.read}/${s.total}`)).join("")}</div>` : "") +
        shelf("Leídos", read.length, "", read) +
        shelf("En tu lista de pendientes", pend.length, "Ya los tienes marcados en Goodreads.", pend) +
        shelf(`Te faltan de ${p.title}`, p.missing.length, `Libros de ${p.title} que todavía no están en tu Goodreads (los más populares primero).`, p.missing) +
        shelf(`Si te gusta ${p.title}…`, similar.length, "Otros autores que suelen gustar a sus lectores.", similar, { why: true }),
    };
  }
  if (p.kind === "serie") {
    const pct = Math.round((p.read / p.total) * 100);
    const missing = p.entries.filter((e) => e.item.status === "missing");
    const similar = recsFor(p.stack.map((b) => b.bookId), null, 8).filter((r) => !p.authors.includes(r.author));
    return {
      kicker: "Serie", title: p.title,
      sub: p.authors.join(", "),
      extra: `<div class="progress"><span class="bar" style="--p:${pct}%"><i></i></span> ${p.read} de ${p.total} leídos${missing.length ? ` · te ${missing.length === 1 ? "falta" : "faltan"} ${missing.length}` : " · ¡serie completa!"}</div>`,
      body:
        `<div class="chips">${p.authors.map((a) => chip(`autor:${slug(a)}`, `Autor <b>${esc(a)}</b>`)).join("")}<a class="chip" href="${esc(p.url)}" target="_blank" rel="noopener">Ver serie en Goodreads ↗</a></div>` +
        shelf("La serie completa", `${p.total} libros`, "En orden de lectura. Los que te faltan aparecen con borde discontinuo.", p.entries, { hideAuthor: true }) +
        shelf("Si te gusta esta serie…", similar.length, "", similar, { why: true }),
    };
  }
  if (p.kind === "genero") {
    const more = piles.get(`pila:mas-${p.id}`)?.recs || MODEL.recs.filter((r) => topGenres(r, 4).includes(p.genre)).slice(0, 10);
    const authors = Object.entries(p.mine.reduce((m, b) => ((m[b.author] = (m[b.author] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      kicker: "Género", title: p.title, sub: `${plural(p.mine.length, "libro", "libros")} en tu biblioteca`,
      body:
        `<div class="chips">${authors.map(([a, n]) => chip(`autor:${slug(a)}`, `<b>${esc(a)}</b>`, ` · ${n}`)).join("")}</div>` +
        shelf("Tus libros", p.mine.length, "", p.mine) +
        shelf(`Más ${p.title.toLowerCase()} para ti`, more.length, "", more, { why: true }),
    };
  }
  return {
    kicker: "Nueva pila para ti ✦", title: p.title, sub: p.why || p.sub,
    body:
      (p.basedOn ? `<div class="chips">${chip(`${p.basedOn.kind}:${p.basedOn.id}`, `Ver tu pila de <b>${esc(p.basedOn.title)}</b>`)}</div>` : "") +
      shelf("Sugerencias", p.recs.length, "", p.recs, { why: true }),
  };
}

let current = null; // pila abierta
let originRect = null;

function fillDetail(p) {
  const c = detailContent(p);
  $("#detail-kicker").textContent = c.kicker;
  $("#detail-title").textContent = c.title;
  $("#detail-sub").innerHTML = esc(c.sub) + (c.extra || "");
  $("#detail-body").innerHTML = c.body;
  $("#detail").scrollTop = 0;
}

async function openPile(key, fromEl) {
  const p = piles.get(key);
  if (!p) return;
  const detail = $("#detail");
  const wasOpen = !detail.hidden;
  current = key;
  const stackEl = fromEl?.querySelector(".stack") || fromEl;
  originRect = stackEl ? stackEl.getBoundingClientRect() : null;
  fillDetail(p);
  document.title = `${p.title} · La biblioteca de ${DATA.user.name}`;

  if (!wasOpen) {
    document.body.classList.add("locked");
    if (!reduceMotion && originRect) {
      const floor = $("#floor");
      const fr = floor.getBoundingClientRect();
      floor.style.transformOrigin = `${originRect.left + originRect.width / 2 - fr.left}px ${originRect.top + originRect.height / 2 - fr.top}px`;
      fromEl.classList.add("zooming");
      $(".top").animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: "forwards" });
      await floor.animate([{ transform: "none", opacity: 1, filter: "blur(0)" }, { transform: "scale(2.8)", opacity: 0, filter: "blur(6px)" }],
        { duration: 560, easing: "cubic-bezier(.6,0,.4,1)", fill: "forwards" }).finished;
    }
    detail.hidden = false;
    detail.scrollTop = 0;
    detail.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  } else if (!reduceMotion) {
    $(".detail-inner").animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "ease-out" });
  }
  spreadBooks(wasOpen ? null : originRect);
  $("#back").focus({ preventScroll: true });
}

// Los libros "salen" de la pila y se colocan en la estantería
function spreadBooks(from) {
  if (reduceMotion) return;
  const cx = from ? from.left + from.width / 2 : innerWidth / 2;
  const cy = from ? from.top + from.height / 2 : innerHeight * 0.3;
  const els = $$("#detail-body .cover-item .cv").filter((el) => el.getBoundingClientRect().top < innerHeight + 40).slice(0, 30);
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2);
    const dy = cy - (r.top + r.height / 2);
    const rot = ((hash(i) % 20) - 10);
    el.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(${rot}deg)`, opacity: 0 },
      { opacity: 1, offset: 0.25 },
      { transform: "none", opacity: 1 },
    ], { duration: 720, delay: 40 + i * 38, easing: "cubic-bezier(.2,.9,.25,1.08)", fill: "backwards" });
  });
}

async function closePile() {
  const detail = $("#detail");
  if (detail.hidden) return;
  current = null;
  document.title = `La biblioteca de ${DATA.user.name}`;
  if (!reduceMotion) await detail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" }).finished;
  detail.hidden = true;
  document.body.classList.remove("locked");
  const floor = $("#floor");
  floor.getAnimations().forEach((a) => a.cancel());
  $(".top").getAnimations().forEach((a) => a.cancel());
  $$(".pile.zooming").forEach((el) => el.classList.remove("zooming"));
  if (!reduceMotion && originRect) {
    floor.animate([{ transform: "scale(2.8)", opacity: 0, filter: "blur(6px)" }, { transform: "none", opacity: 1, filter: "blur(0)" }],
      { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" });
    $(".top").animate([{ opacity: 0 }, { opacity: 1 }], { duration: 520 });
  }
  const back = lastPileEl && document.contains(lastPileEl) ? lastPileEl : null;
  back?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ ficha de libro

function openCard(it, fromEl) {
  const layer = $("#card");
  const src = coverUrl(it.cover, 600);
  $("#card-cover").innerHTML = `<div class="cv" style="--spine:${it.spine}">${src ? `<img src="${esc(src)}" alt="Portada de ${esc(it.title)}">` : `<div class="fallback">${esc(it.title)}</div>`}</div>`;
  const status = {
    read: `<span class="status-pill read">✓ Leído</span>`, reading: `<span class="status-pill pending">Leyendo</span>`,
    pending: `<span class="status-pill pending">En tu lista de pendientes</span>`, missing: `<span class="status-pill missing">Te falta</span>`,
    rec: `<span class="status-pill pending">✦ Recomendado para ti</span>`,
  }[it.status];
  const authorKey = `autor:${slug(it.author)}`;
  const author = piles.has(authorKey) && current !== authorKey ? `<button data-go="${esc(authorKey)}">${esc(it.author)}</button>` : esc(it.author);
  const series = (it.series || []).map((s) => {
    const sp = [...piles.values()].find((p) => p.kind === "serie" && p.url === s.url);
    const label = `${esc(s.title)}${s.position ? ` #${esc(s.position)}` : ""}`;
    return sp && current !== `serie:${sp.id}` ? `<button class="chip" data-go="serie:${esc(sp.id)}">Serie <b>${label}</b></button>` : `<span class="chip">Serie <b>${label}</b></span>`;
  }).join("");
  const meta = [
    it.userRating ? `<span>Tu nota <b class="stars">${"★".repeat(it.userRating)}${"☆".repeat(5 - it.userRating)}</b></span>` : "",
    it.avgRating ? `<span>Media <b>★ ${Number(it.avgRating).toFixed(2)}</b>${it.ratingsCount ? ` (${num(it.ratingsCount)})` : ""}</span>` : "",
    it.pages ? `<span><b>${num(it.pages)}</b> páginas</span>` : "",
    it.year ? `<span>Publicado en <b>${it.year}</b></span>` : "",
    it.dateAdded ? `<span>Añadido el <b>${new Date(it.dateAdded).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}</b></span>` : "",
  ].join("");
  const genres = topGenres(it, 5).map((g) => {
    const gk = `genero:${slug(g)}`;
    return piles.has(gk) && current !== gk ? `<button class="chip" data-go="${gk}">${esc(genreEs(g))}</button>` : `<span class="chip">${esc(genreEs(g))}</span>`;
  }).join("");
  const because = it.because?.length ? `<p class="hint">Porque leíste ${it.because.map((id) => items.get(`b${id}`)).filter(Boolean).map((b) => `<b>${esc(b.title)}</b>`).join(", ")}.</p>` : "";
  $("#card-info").innerHTML = `${status}<h3 id="card-title">${esc(it.title)}</h3><p class="by">de ${author}</p>
    <div class="meta">${meta}</div>${because}
    ${it.description ? `<p class="desc">${esc(it.description)}</p>` : ""}
    <div class="chips">${series}${genres}</div>
    <div class="card-actions"><a class="btn" href="${grUrl(it)}" target="_blank" rel="noopener">${it.status === "read" || it.status === "pending" || it.status === "reading" ? "Ver en Goodreads" : "Quiero leerlo · Goodreads"} ↗</a></div>`;
  layer.hidden = false;
  if (!reduceMotion) {
    const card = $(".card");
    const r = fromEl?.getBoundingClientRect();
    const cr = card.getBoundingClientRect();
    const t = r ? `translate(${r.left + r.width / 2 - (cr.left + cr.width / 2)}px, ${r.top + r.height / 2 - (cr.top + cr.height / 2)}px) scale(.3) rotateY(-40deg)` : "scale(.9)";
    card.animate([{ transform: `perspective(1200px) ${t}`, opacity: 0 }, { transform: "perspective(1200px)", opacity: 1 }], { duration: 480, easing: "cubic-bezier(.2,.9,.3,1)" });
    layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
  }
  $("#card-close").focus({ preventScroll: true });
}

async function closeCard() {
  const layer = $("#card");
  if (layer.hidden) return;
  if (!reduceMotion) await layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160 }).finished;
  layer.hidden = true;
}

// ------------------------------------------------------------------ navegación (#/autor/juan-gomez-jurado)

let lastPileEl = null;
const modeFor = { autor: "autores", serie: "series", genero: "generos", pila: "parati" };

function keyFromHash() {
  const m = location.hash.match(/^#\/(autor|serie|genero|pila)\/(.+)$/);
  return m ? `${m[1]}:${decodeURIComponent(m[2])}` : null;
}
function go(key) {
  const [kind, id] = key.split(":");
  location.hash = `#/${kind}/${encodeURIComponent(id)}`;
}
function setMode(mode) {
  state.mode = mode;
  $$("#modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === mode)));
  renderFloor();
}

async function route() {
  const key = keyFromHash();
  await closeCard();
  if (!key || !piles.has(key)) { await closePile(); return; }
  if ($("#detail").hidden) {
    let el = lastPileEl?.dataset.pile === key ? lastPileEl : $(`.pile[data-pile="${CSS.escape(key)}"]`);
    if (!el) {
      setMode(modeFor[key.split(":")[0]]);
      el = $(`.pile[data-pile="${CSS.escape(key)}"]`);
      el?.scrollIntoView({ block: "center" });
    }
    lastPileEl = el;
    await openPile(key, el);
  } else {
    await openPile(key, null);
  }
}

// ------------------------------------------------------------------ arranque

function renderStats(m) {
  const read = m.owned.filter((b) => b.status === "read");
  const pages = read.reduce((s, b) => s + (b.pages || 0), 0);
  $("#stats").innerHTML = [
    `<b>${read.length}</b> leídos`, `<b>${m.owned.length - read.length}</b> pendientes`,
    `<b>${m.authorPiles.length}</b> autores`, `<b>${m.seriesPiles.length}</b> series`, `<b>${num(pages)}</b> páginas`,
  ].join(" · ");
  $("#user-name").textContent = DATA.user.name;
  $("#gr-link").href = DATA.user.profile;
  const d = new Date(DATA.generatedAt);
  $("#updated").textContent = `Actualizado el ${d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`;
}

async function init() {
  try {
    DATA = await (await fetch("data/library.json")).json();
  } catch (e) {
    $("#floor").innerHTML = `<p class="empty">No se pudo cargar data/library.json (${esc(e.message)}).</p>`;
    return;
  }
  MODEL = buildModel();
  renderStats(MODEL);
  renderFloor();

  $("#modes").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]");
    if (b) setMode(b.dataset.mode);
  });
  let t;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); renderFloor(); }, 120);
  });
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; renderFloor(); });

  $("#floor").addEventListener("click", (e) => {
    const el = e.target.closest(".pile");
    if (!el) return;
    lastPileEl = el;
    go(el.dataset.pile);
  });
  document.addEventListener("click", (e) => {
    const goEl = e.target.closest("[data-go]");
    if (goEl) { e.preventDefault(); go(goEl.dataset.go); return; }
    const cov = e.target.closest(".cover-item");
    if (cov) openCard(items.get(cov.dataset.key), cov.querySelector(".cv"));
  });
  $("#back").addEventListener("click", () => { history.replaceState(null, "", location.pathname + location.search); route(); });
  $("#card-close").addEventListener("click", closeCard);
  $("#card").addEventListener("click", (e) => { if (e.target.id === "card") closeCard(); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("#card").hidden) closeCard();
    else if (!$("#detail").hidden) $("#back").click();
  });
  addEventListener("hashchange", route);
  let rt;
  let small = matchMedia("(max-width: 640px)").matches;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const now = matchMedia("(max-width: 640px)").matches;
      if (now !== small && $("#detail").hidden) { small = now; renderFloor(); }
    }, 200);
  });
  if (keyFromHash()) route();
}

init();
