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
const REPO = "dhighwayman/mybooks";

// Versión publicada (la inyecta .github/workflows/pages.yml); en local quedan los marcadores
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "";
const BUILD = { short: meta("build"), sha: meta("build-sha"), date: meta("build-date") };
const IS_LOCAL = !BUILD.short || BUILD.short.startsWith("__");

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
const COVER_SIZE = 400; // mismo tamaño en pilas y mesa: los libros "voladores" ya tienen la portada en caché
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
  const src = coverUrl(it.cover, COVER_SIZE);
  return `<div class="${cls}" data-key="${esc(it.key)}" style="--z:${z}px;--t:${t}px;--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;--r:${r.toFixed(1)}deg;--spine:${it.spine}">
    <div class="f f-top">${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}<div class="fallback">${esc(it.title)}</div></div>
    <div class="f f-spine"><span>${esc(it.title)}</span></div>
    <div class="f f-front"></div>
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
  const rz = -(16 + rnd() * 20); // girada para que se vea el lado izquierdo: el lomo
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

const thickness = (it) => Math.max(9, Math.min(26, (it.pages || 350) / 22));
const restPose = (r) => `perspective(1100px) translateZ(0px) rotateX(14deg) rotateY(20deg) rotateZ(${r}deg)`;

function bookObj(it, inner = "", { size = COVER_SIZE, tilt = true } = {}) {
  const src = coverUrl(it.cover, size);
  const r = tilt ? ((hash(it.key) % 7) - 3) : 0;
  return `<div class="bk-wrap"><div class="bk-shadow"></div>
    <div class="bk" style="--t:${thickness(it).toFixed(1)}px;--spine:${it.spine};--r:${r}deg" data-r="${r}">
      <div class="bk-face bk-front"><div class="fallback">${esc(it.title)}<em>${esc(it.author)}</em></div>
        ${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}${inner}</div>
      <div class="bk-face bk-spine"><span>${esc(it.title)}</span></div>
      <div class="bk-face bk-edge-r"></div>
      <div class="bk-face bk-edge-b"></div>
    </div></div>`;
}

function coverHTML(it, opts = {}) {
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
    ${bookObj(it, numb + badge)}
    <span class="cap"><span class="t">${esc(it.title)}</span>
    <span class="a">${esc(opts.hideAuthor ? [it.year, it.avgRating && `★ ${it.avgRating.toFixed(2)}`].filter(Boolean).join(" · ") : it.author)}</span>
    ${stars}${why}</span>
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

function fillDetail(p) {
  const c = detailContent(p);
  $("#detail-kicker").textContent = c.kicker;
  $("#detail-title").textContent = c.title;
  $("#detail-sub").innerHTML = esc(c.sub) + (c.extra || "");
  $("#detail-body").innerHTML = c.body;
  $("#detail").scrollTop = 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZOOM = 1.3;
const SMALL = () => matchMedia("(max-width: 640px)").matches; // en móvil, menos libros animados a la vez
let opened = null; // { key, el } pila desde la que se abrió el detalle

// Libros de una pila en pantalla, del de arriba al de abajo
function stackFaces(pileEl) {
  return [...pileEl.querySelectorAll(".book3d")].reverse().map((el) => ({ key: el.dataset.key, el, rect: el.querySelector(".f-top").getBoundingClientRect() }));
}
function visibleWrap(key, taken) {
  return $$(`#detail-body .cover-item[data-key="${CSS.escape(key)}"] .bk-wrap`)
    .find((w) => !taken.has(w) && w.getBoundingClientRect().top < innerHeight - 40);
}

// Los libros vuelan entre la pila (tumbados) y la mesa (su sitio en la cuadrícula).
// Todo se hace por fases (leer, escribir, leer, escribir) para no forzar el layout libro a libro.
function flyAll(pairs, { back = false, rz = 20, step = 110 } = {}) {
  const duration = 980;
  // fase 1 (lectura): dónde está cada libro en la mesa
  const jobs = pairs.map(({ wrap, face }, i) => {
    const bk = wrap.querySelector(".bk");
    const cs = getComputedStyle(wrap);
    const br = parseFloat(face.el.style.getPropertyValue("--r")) || 0;
    return {
      wrap, face, bk, delay: i * step,
      to: wrap.getBoundingClientRect(),
      r: Number(bk.dataset.r) || 0,
      w: cs.getPropertyValue("--w"), h: cs.getPropertyValue("--h"),
      // misma postura que el libro en la pila (la pila se dibuja sin perspectiva)
      startRot: rz + 8 + (face.el.classList.contains("is-top") ? br - 5 : br * 1.8),
    };
  });
  const outerFrames = (dx, dy, s) => [
    { transform: `translate(${dx}px, ${dy}px) scale(${s})`, offset: 0 },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 110}px) scale(${(s + 1) / 2 * 1.12})`, offset: 0.42 },
    { transform: "translate(0px, 0px) scale(1)", offset: 1 },
  ];
  const rev = (k) => k.reverse().map((f) => ({ ...f, offset: 1 - f.offset }));
  // fase 2 (escritura): crear los voladores en la postura de la pila
  const layer = $("#flyers");
  for (const j of jobs) {
    const { to, face } = j;
    j.cx = to.left + to.width / 2; j.cy = to.top + to.height / 2;
    j.dx = face.rect.left + face.rect.width / 2 - j.cx;
    j.dy = face.rect.top + face.rect.height / 2 - j.cy;
    j.s = Math.max(0.35, Math.min(1.3, (face.rect.width * 0.82) / to.width));
    const ghost = document.createElement("div");
    ghost.className = "flyer";
    Object.assign(ghost.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px` });
    ghost.style.setProperty("--w", j.w);
    ghost.style.setProperty("--h", j.h);
    const clone = j.bk.cloneNode(true);
    clone.style.transition = "none";
    // la portada ya está decodificada: en síncrono el volador nunca sale sin ella
    clone.querySelectorAll("img").forEach((img) => { img.loading = "eager"; img.decoding = "sync"; });
    ghost.appendChild(clone);
    layer.appendChild(ghost);
    let outer = outerFrames(j.dx, j.dy, j.s);
    let inner = [
      { transform: `perspective(20000px) translateZ(0px) rotateX(52deg) rotateY(0deg) rotateZ(${j.startRot}deg)`, offset: 0 },
      { transform: `perspective(2400px) translateZ(40px) rotateX(30deg) rotateY(-14deg) rotateZ(${j.r + rz * 0.3}deg)`, offset: 0.42 },
      { transform: restPose(j.r), offset: 1 },
    ];
    if (back) { outer = rev(outer); inner = rev(inner); }
    const opts = { duration, delay: j.delay, easing: "cubic-bezier(.5,.05,.2,1)", fill: "both" };
    j.a = ghost.animate(outer, opts);
    j.b = clone.animate(inner, opts);
    const pileT = back ? duration + j.delay : 0;
    j.a.pause(); j.b.pause();
    j.a.currentTime = pileT; j.b.currentTime = pileT;
    j.ghost = ghost; j.clone = clone;
    j.wrap.style.visibility = "hidden";
  }
  // fase 3 (lectura): medir la tapa de cada volador en la postura de la pila
  for (const j of jobs) j.fr = j.clone.querySelector(".bk-front").getBoundingClientRect();
  // fase 4 (escritura): corregir tamaño y posición para que coincida con el libro de la pila, y arrancar
  for (const j of jobs) {
    const { fr, face } = j;
    if (fr.width > 1) {
      const k = face.rect.width / fr.width;
      const ex = (fr.left + fr.width / 2 - j.cx - j.dx) * k;
      const ey = (fr.top + fr.height / 2 - j.cy - j.dy) * k;
      let fixed = outerFrames(face.rect.left + face.rect.width / 2 - j.cx - ex, face.rect.top + face.rect.height / 2 - j.cy - ey, j.s * k);
      if (back) fixed = rev(fixed);
      j.a.effect.setKeyframes(fixed);
    }
    j.a.currentTime = 0; j.b.currentTime = 0;
    j.a.play(); j.b.play();
    j.done = j.a.finished.then(() => j);
  }
  return jobs;
}

function pairFaces(faces) {
  const taken = new Set();
  const pairs = [];
  for (const face of faces.slice(0, SMALL() ? 5 : 8)) {
    const wrap = visibleWrap(face.key, taken);
    if (!wrap) continue;
    taken.add(wrap);
    pairs.push({ wrap, face });
  }
  return { pairs, taken };
}

// Los libros que no estaban en la pila caen sobre la mesa.
// Sin fundidos de opacidad sobre los libros 3D (obligan a aplanar y redibujar sus caras en cada
// fotograma): cada libro se hace visible en su momento y cae girando desde el canto (solo transform).
const edgePose = (r) => `perspective(1100px) translateZ(0px) rotateX(84deg) rotateY(0deg) rotateZ(${r + 10}deg)`;
const inView = (el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight + 40; };

function dealTargets(skip = new Set()) {
  return $$("#detail-body .cover-item").filter((c) => !skip.has(c.querySelector(".bk-wrap")) && inView(c)).slice(0, SMALL() ? 12 : 40);
}
function reveal(el, delay, then) {
  setTimeout(() => { el.style.visibility = "visible"; then?.(); }, delay);
}
function dealIn(list, base = 0) {
  if (list instanceof Set) list = dealTargets(list);
  if (reduceMotion) return;
  list.forEach((c, i) => {
    const w = c.querySelector(".bk-wrap");
    const bk = w.querySelector(".bk");
    const r = Number(bk.dataset.r) || 0;
    c.style.visibility = "hidden";
    reveal(c, base + i * 45, () => {
      const opts = { duration: 650, easing: "cubic-bezier(.2,.9,.3,1.05)" };
      w.animate([{ transform: "translateY(-46px) scale(1.1)" }, { transform: "none" }], opts);
      bk.animate([{ transform: edgePose(r) }, { transform: restPose(r) }], opts);
      c.querySelector(".cap")?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 150, fill: "backwards" });
    });
  });
}

// Textos de la mesa visibles en pantalla (cabecera, títulos de estante, avisos, chips)
const tableTexts = () => $$(".detail-head, #detail-body > .chips, #detail-body .shelf h4, #detail-body .shelf .hint").filter(inView);

function fillDetailAndShow(p) {
  fillDetail(p);
  document.title = `${p.title} · La biblioteca de ${DATA.user.name}`;
}

async function openPile(key, fromEl) {
  const p = piles.get(key);
  if (!p) return;
  const detail = $("#detail");
  const floor = $("#floor");
  const wasOpen = !detail.hidden;
  current = key;
  fillDetailAndShow(p);

  if (wasOpen) {
    if (!reduceMotion) $(".detail-head").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "ease-out" });
    dealIn(new Set(), 60);
    $("#back").focus({ preventScroll: true });
    return;
  }

  document.body.classList.add("locked");
  const animate = !reduceMotion && fromEl;
  const bg = $("#detail-bg");
  const inner = $(".detail-inner");
  opened = fromEl ? { key, el: fromEl, lift: null } : null;
  bg.hidden = false;
  if (!animate) {
    detail.hidden = false;
    detail.scrollTop = 0;
    $("#back").focus({ preventScroll: true });
    if (!reduceMotion) {
      bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
      inner.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
    }
    dealIn(new Set(), 80);
    return;
  }

  // 0. preparar la mesa antes de mover la cámara (maquetada pero oculta)
  inner.classList.add("pre");
  detail.style.pointerEvents = "none";
  detail.hidden = false;
  detail.scrollTop = 0;
  const lift = liftPile(fromEl); // la pila elegida, en su propia capa
  opened.lift = lift;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // 1. la cámara se acerca a la pila; una sola capa oscura tapa el resto del suelo
  const sr = lift.getBoundingClientRect();
  const fr = floor.getBoundingClientRect();
  floor.style.transformOrigin = `${sr.left + sr.width / 2 - fr.left}px ${sr.top + sr.height / 2 - fr.top}px`;
  floor.classList.add("focusing");
  const zoom = { duration: 650, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" };
  bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 600, easing: "ease-in-out", fill: "backwards" });
  floor.animate([{ transform: "none" }, { transform: `scale(${ZOOM})` }], zoom);
  await lift.animate([{ transform: "none" }, { transform: `scale(${ZOOM})` }], zoom).finished;
  $("#back").focus({ preventScroll: true });

  // 2. la pila se deshace: cada libro vuela desde su sitio en la pila hasta la mesa
  const rz = parseFloat(lift.querySelector(".stack").style.getPropertyValue("--rz")) || 20;
  // lectura
  const faces = stackFaces(lift);
  const { pairs, taken } = pairFaces(faces);
  const deal = dealTargets(taken);
  const texts = tableTexts();
  // escritura: lo que va a aparecer se oculta uno a uno y la mesa deja de estar oculta en bloque
  const flying = new Set(pairs.map((p) => p.face));
  faces.forEach((f, i) => { if (!flying.has(f)) setTimeout(() => { f.el.style.visibility = "hidden"; }, i * 110); });
  pairs.forEach((p) => { p.wrap.closest(".cover-item").style.visibility = "hidden"; });
  texts.forEach((el) => { el.style.visibility = "hidden"; });
  dealIn(deal, 350 + pairs.length * 70);
  inner.classList.remove("pre");
  const jobs = flyAll(pairs, { rz });
  jobs.forEach((j) => setTimeout(() => { j.face.el.style.visibility = "hidden"; }, j.delay));
  const flights = jobs.map((j) => j.done.then(() => {
    const c = j.wrap.closest(".cover-item");
    c.style.visibility = "visible";
    j.wrap.style.visibility = "";
    j.ghost.remove();
    c.querySelectorAll(".cap, .badge, .num").forEach((el) => el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }));
  }));
  texts.forEach((el, i) => reveal(el, 80 + i * 60, () => el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 450, easing: "ease-out" })));
  requestAnimationFrame(() => { floor.style.visibility = "hidden"; }); // tapado: que el navegador deje de dibujarlo
  setTimeout(() => { detail.style.pointerEvents = ""; }, 400);
  await Promise.all(flights);
}

// Copia de la pila en una capa fija, encima del suelo, con la postura de "hover" congelada
function liftPile(pileEl) {
  const stage = pileEl.querySelector(".stage");
  const r = stage.getBoundingClientRect();
  const cs = getComputedStyle(pileEl);
  const lift = document.createElement("div");
  lift.className = "lifted";
  Object.assign(lift.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  lift.style.setProperty("--W", cs.getPropertyValue("--W"));
  lift.style.setProperty("--D", cs.getPropertyValue("--D"));
  if (pileEl.classList.contains("rec")) lift.classList.add("rec");
  lift.appendChild(stage.cloneNode(true));
  document.body.appendChild(lift);
  pileEl.style.visibility = "hidden";
  return lift;
}

async function closePile() {
  const detail = $("#detail");
  if (detail.hidden) return;
  const floor = $("#floor");
  const bg = $("#detail-bg");
  const inner = $(".detail-inner");
  const lift = opened?.lift && document.contains(opened.lift) ? opened.lift : null;
  const sameKey = opened && opened.key === current;
  current = null;
  document.title = `La biblioteca de ${DATA.user.name}`;
  $$("#flyers .flyer").forEach((g) => g.remove());

  if (!reduceMotion && lift) {
    // 3. los libros vuelven a apilarse (el de abajo primero) mientras la mesa se despeja
    const faces = sameKey ? stackFaces(lift).reverse() : [];
    const rz = parseFloat(lift.querySelector(".stack").style.getPropertyValue("--rz")) || 20;
    const covers = $$("#detail-body .cover-item").filter(inView);
    const texts = tableTexts();
    const { pairs } = pairFaces(faces);
    const jobs = flyAll(pairs, { back: true, rz, step: 70 });
    const flights = jobs.map((j) => j.done.then(() => { j.face.el.style.visibility = ""; j.ghost.remove(); }));
    // el resto de libros se levanta sobre el canto y desaparece (solo transform), los textos se funden
    const flown = new Set(pairs.map((p) => p.wrap));
    const lifts = covers.filter((c) => !flown.has(c.querySelector(".bk-wrap"))).slice(0, 40).map((c, i) => {
      const w = c.querySelector(".bk-wrap");
      const bk = w.querySelector(".bk");
      const r = Number(bk.dataset.r) || 0;
      const o = { duration: 260, delay: i * 12, easing: "ease-in", fill: "forwards" };
      w.animate([{ transform: "none" }, { transform: "translateY(-30px) scale(1.05)" }], o);
      return bk.animate([{ transform: restPose(r) }, { transform: edgePose(r) }], o).finished.then(() => { c.style.visibility = "hidden"; });
    });
    covers.forEach((c) => c.querySelector(".cap")?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: "forwards" }));
    texts.forEach((el) => el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards" }));
    await Promise.all([...flights, ...lifts, sleep(300)]);
    lift.querySelectorAll(".book3d").forEach((el) => { el.style.visibility = ""; });
  } else if (!reduceMotion) {
    await Promise.all([
      inner.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: "ease-in" }).finished,
      bg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished,
    ]);
  }
  detail.hidden = true;
  inner.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  $$(".detail-head, #detail-body *").forEach((el) => { if (el.style.visibility) el.style.visibility = ""; });
  inner.classList.remove("pre");
  inner.style.opacity = "";
  detail.style.pointerEvents = "";
  document.body.classList.remove("locked");

  // 4. la cámara se aleja y la capa oscura desaparece
  floor.style.visibility = "";
  const old = [...floor.getAnimations(), ...bg.getAnimations(), ...(lift ? lift.getAnimations() : [])];
  if (!reduceMotion && lift) {
    const out = { duration: 650, easing: "cubic-bezier(.3,.7,.2,1)" };
    const a = floor.animate([{ transform: `scale(${ZOOM})` }, { transform: "none" }], out);
    const b = lift.animate([{ transform: `scale(${ZOOM})` }, { transform: "none" }], out);
    const c = bg.animate([{ opacity: 1 }, { opacity: 0 }], { ...out, fill: "forwards" });
    old.forEach((x) => x.cancel());
    await Promise.all([a.finished, b.finished, c.finished]).catch(() => {});
  } else {
    old.forEach((x) => x.cancel());
  }
  bg.hidden = true;
  bg.getAnimations().forEach((x) => x.cancel());
  floor.classList.remove("focusing");
  if (opened?.el) opened.el.style.visibility = "";
  lift?.remove();
  opened = null;
  const back = lastPileEl && document.contains(lastPileEl) ? lastPileEl : null;
  back?.focus({ preventScroll: true });
}

// ------------------------------------------------------------------ ficha de libro

function openCard(it, fromEl) {
  const layer = $("#card");
  $("#card-cover").innerHTML = bookObj(it, "", { size: 600, tilt: false });
  $("#card-cover img")?.setAttribute("alt", `Portada de ${it.title}`);
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
    $("#card-cover .bk").animate([{ transform: "perspective(1100px) translateZ(0px) rotateX(10deg) rotateY(-70deg) rotateZ(0deg)" }, { transform: "perspective(1100px) translateZ(0px) rotateX(8deg) rotateY(24deg) rotateZ(0deg)" }],
      { duration: 900, delay: 120, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" });
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

async function renderVersion() {
  const el = $("#version");
  if (IS_LOCAL) {
    const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    el.textContent = local ? "Versión local (sin publicar)" : "Versión sin identificar: publicada sin el workflow de GitHub Actions";
    return;
  }
  const when = new Date(BUILD.date);
  const date = isNaN(when) ? "" : ` · ${when.toLocaleString("es-ES", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  el.innerHTML = `Versión <a href="https://github.com/${REPO}/commit/${esc(BUILD.sha)}" target="_blank" rel="noopener"><code>${esc(BUILD.short)}</code></a>${esc(date)}`;
  // ¿hay una versión más nueva publicada que la que estoy viendo (caché)?
  try {
    const latest = await (await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" })).json();
    if (latest.short && latest.short !== BUILD.short) {
      el.insertAdjacentHTML("beforeend", ` · <strong class="stale">hay una versión más nueva (<code>${esc(latest.short)}</code>)</strong> <button class="chip" id="reload">Recargar</button>`);
      $("#reload").addEventListener("click", () => location.reload());
    }
  } catch {
    if (!navigator.onLine) el.insertAdjacentHTML("beforeend", " · sin conexión: copia guardada");
  }
}

// ------------------------------------------------------------------ app instalable (PWA)

function setupPWA() {
  if (!IS_LOCAL && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  const area = $("#install-area");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return;
  // Android / Chrome / Edge: botón propio en vez del aviso del navegador
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    area.innerHTML = `<br><button class="chip install" id="install">⤓ Instalar la app</button>`;
    $("#install").addEventListener("click", async () => {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      deferred = null;
      area.innerHTML = "";
    });
  });
  addEventListener("appinstalled", () => { area.innerHTML = ""; });
  // iPhone / iPad: Safari no tiene botón de instalar, solo "Añadir a pantalla de inicio"
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    area.innerHTML = `<br><span class="ios-hint">Para instalarla: <b>Compartir</b> <span aria-hidden="true">⎋</span> → <b>Añadir a pantalla de inicio</b></span>`;
  }
}

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
    DATA = await (await fetch(`data/library.json${IS_LOCAL ? "" : `?v=${BUILD.short}`}`)).json();
  } catch (e) {
    $("#floor").innerHTML = `<p class="empty">No se pudo cargar data/library.json (${esc(e.message)}).</p>`;
    return;
  }
  renderVersion();
  setupPWA();
  MODEL = buildModel();
  renderStats(MODEL);
  const modo = new URLSearchParams(location.search).get("modo");
  if (["autores", "series", "generos", "parati"].includes(modo)) state.mode = modo;
  $$("#modes button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === state.mode)));
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
    if (cov) openCard(items.get(cov.dataset.key), cov.querySelector(".bk-wrap"));
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
