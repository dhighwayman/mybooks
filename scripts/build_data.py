#!/usr/bin/env python3
"""Genera data/library.json a partir del perfil público de Goodreads.

Uso:
    python3 scripts/build_data.py                # usa la caché (cache/)
    python3 scripts/build_data.py --refresh      # vuelve a descargar las estanterías
    python3 scripts/build_data.py --refresh-all  # vuelve a descargar todo

Solo usa la biblioteca estándar de Python. Las páginas de Goodreads se
resumen y se guardan en cache/ (versionada) para no repetir peticiones.
"""

import argparse
import hashlib
import html
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

USER_ID = "79173731"
USER_NAME = "David"
SHELVES = ["read", "currently-reading", "to-read"]
BASE = "https://www.goodreads.com"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, "cache")  # versionada: así la Action solo descarga lo nuevo
OUT = os.path.join(ROOT, "data", "library.json")

# Series que en Goodreads no son "series" de verdad (colecciones editoriales).
SERIES_BLOCKLIST = re.compile(r"penguin readers|graded readers|oxford bookworms|biblioteca|colecci[oó]n", re.I)
# Recopilatorios, packs y ediciones especiales que no queremos sugerir.
PACK_RE = re.compile(
    r"\b(pack|box ?set|boxed|estuche|trilog[ií]a|bilog[ií]a|omnibus|collection|colecci[oó]n|"
    r"complete|obras completas|edici[oó]n (serie|pack|especial)|\d+\s*-\s*\d+|books? \d+ ?(-|&|and) ?\d+|"
    r"libros? \d+ ?(-|y) ?\d+|summary|resumen|study guide|sparknotes|cliffsnotes|workbook)\b",
    re.I,
)
# Muestras, guías, guiones y demás que no son "el libro".
JUNK_RE = re.compile(
    r"\b(sample|sampler|preview|excerpt|first (three )?chapters?|chapter sampler|screenplay|shooting script|scripts?|"
    r"unofficial|guide to|companion|study|summary|analysis|notes on|adaptation|free|extracto|primeros cap[ií]tulos|"
    r"novels of|obras selectas|complete works?|en busca de respuestas)\b"
    r"|\s[/+&]\s",
    re.I,
)
NON_LATIN_RE = re.compile(r"[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F\u2190-\u21FF'’“”«»…–—]")
SERIES_NAME_BLOCK = re.compile(r"split-volume|\bedition\b|universe of", re.I)
# Correcciones puntuales (p. ej. lecturas graduadas donde Goodreads pone como autor al adaptador)
AUTHOR_OVERRIDES = {"5358": {"author": "John Grisham", "authorId": "721"}}
GENERIC_GENRES = {"Fiction", "Audiobook", "Novels", "Adult", "Adult Fiction", "Literature", "Book Club", "Contemporary"}

MAX_AUTHOR_SUGGESTIONS = 8
MAX_AUTHOR_CHECKS = 22
SIMILAR_DETAIL_LIMIT = 160

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
_last_request = 0.0


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, tries=4):
    global _last_request
    wait = 0.35 - (time.time() - _last_request)
    if wait > 0:
        time.sleep(wait)
    for attempt in range(tries):
        try:
            _last_request = time.time()
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"})
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read().decode("utf-8", "replace")
            if len(body) > 500:
                return body
            # Goodreads a veces responde 200 con el cuerpo vacío: reintentar
            log(f"  ! {url}: respuesta vacía (intento {attempt + 1})")
            time.sleep(2 ** (attempt + 1))
            continue
        except Exception as e:  # noqa: BLE001
            if getattr(e, "code", None) == 404:
                return None
            log(f"  ! {url}: {e} (intento {attempt + 1})")
            time.sleep(2 ** (attempt + 1))
    return None


def cached(kind, key, producer, refresh=False):
    """Guarda en .cache/<kind>/<hash>.json el resultado (ya resumido) de producer()."""
    d = os.path.join(CACHE, kind)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, hashlib.sha1(str(key).encode()).hexdigest()[:16] + ".json")
    if not refresh and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    value = producer()
    if value is not None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False)
    return value


# --------------------------------------------------------------------------- utilidades

def clean_ws(s):
    return re.sub(r"\s+", " ", s or "").strip()


def cover_base(url):
    """Quita el sufijo de tamaño (._SY75_) para poder pedir la portada al tamaño que queramos."""
    if not url or "nophoto" in url:
        return None
    url = url.replace("m.media-amazon.com/images/S/compressed.photo.goodreads.com", "i.gr-assets.com/images/S/compressed.photo.goodreads.com")
    return re.sub(r"\._[A-Z0-9_,]+_(\.\w+)$", r"\1", url)


def strip_html(s, limit=600):
    s = re.sub(r"<br\s*/?>", "\n", s or "")
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    s = re.sub(r"\n{3,}", "\n\n", s).strip()
    if len(s) > limit:
        s = s[:limit].rsplit(" ", 1)[0] + "…"
    return s


def slug(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def react_props(page, component):
    out = []
    for m in re.finditer(r'data-react-class="ReactComponents\.%s" data-react-props="([^"]*)"' % component, page):
        out.append(json.loads(html.unescape(m.group(1))))
    return out


def small_book(b):
    """Normaliza un libro que viene de SeriesList / SimilarBooksList."""
    return {
        "bookId": str(b["bookId"]),
        "workId": str(b.get("workId") or ""),
        "title": clean_ws(b.get("bookTitleBare") or b.get("title")),
        "fullTitle": clean_ws(b.get("title")),
        "authorId": str(b.get("author", {}).get("id", "")),
        "author": clean_ws(b.get("author", {}).get("name", "")),
        "cover": cover_base(b.get("imageUrl")),
        "pages": b.get("numPages"),
        "avgRating": b.get("avgRating"),
        "ratingsCount": b.get("ratingsCount") or 0,
        "year": _year(b.get("publicationDate")),
        "description": strip_html((b.get("description") or {}).get("html"), 400),
        "toBePublished": bool(b.get("toBePublished")),
    }


def _ts_year(ms):
    """Año a partir de milisegundos desde 1970 (admite fechas antes de Cristo)."""
    if ms is None:
        return None
    return 1970 + math.floor(ms / 1000 / 31556952)


def _year(v):
    if v is None:
        return None
    m = re.search(r"(\d{4})", str(v))
    return int(m.group(1)) if m else None


# --------------------------------------------------------------------------- scrapers

def parse_shelf(shelf):
    books = []
    page = 1
    while True:
        xml = fetch(f"{BASE}/review/list_rss/{USER_ID}?shelf={shelf}&page={page}")
        if not xml:
            break
        root = ET.fromstring(xml)
        items = root.findall("./channel/item")
        if not items:
            break
        for it in items:
            g = lambda tag: (it.findtext(tag) or "").strip()  # noqa: E731
            added = g("user_date_added")
            read_at = g("user_read_at")
            books.append({
                "bookId": g("book_id"),
                "title": clean_ws(g("title")),
                "author": clean_ws(g("author_name")),
                "rssCover": cover_base(g("book_large_image_url")),
                "userRating": int(g("user_rating") or 0),
                "avgRating": float(g("average_rating") or 0) or None,
                "dateAdded": _iso(added),
                "dateRead": _iso(read_at),
                "shelf": shelf,
                "pages": int(it.findtext("./book/num_pages") or 0) or None,
            })
        page += 1
    return books


def _iso(s):
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).date().isoformat()
    except Exception:  # noqa: BLE001
        return None


def book_page(book_id):
    page = fetch(f"{BASE}/book/show/{book_id}")
    if not page:
        return None
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S)
    if not m:
        return None
    apollo = json.loads(m.group(1))["props"]["pageProps"]["apolloState"]
    book = next((v for k, v in apollo.items() if k.startswith("Book:") and str(v.get("legacyId")) == str(book_id)), None)
    if not book:
        book = next((v for k, v in apollo.items() if k.startswith("Book:") and v.get("title")), None)
    if not book:
        return None
    ref = lambda r: apollo.get((r or {}).get("__ref"), {})  # noqa: E731
    author = ref((book.get("primaryContributorEdge") or {}).get("node"))
    work = ref(book.get("work"))
    series = []
    for bs in book.get("bookSeries") or []:
        s = ref(bs.get("series"))
        if s.get("webUrl"):
            series.append({"title": clean_ws(s.get("title")), "url": s["webUrl"], "position": bs.get("userPosition") or ""})
    details = book.get("details") or {}
    wdetails = work.get("details") or {}
    stats = work.get("stats") or {}
    pub = wdetails.get("publicationTime") or details.get("publicationTime")
    return {
        "bookId": str(book.get("legacyId") or book_id),
        "workId": str(work.get("legacyId") or ""),
        "title": clean_ws(book.get("title")),
        "fullTitle": clean_ws(book.get("titleComplete") or book.get("title")),
        "authorId": str(author.get("legacyId") or ""),
        "author": clean_ws(author.get("name")),
        "authorImage": author.get("profileImageUrl"),
        "cover": cover_base(book.get("imageUrl")),
        "genres": [g["genre"]["name"] for g in (book.get("bookGenres") or []) if g.get("genre")],
        "series": series,
        "pages": details.get("numPages"),
        "language": (details.get("language") or {}).get("name"),
        "year": _ts_year(pub),
        "avgRating": stats.get("averageRating"),
        "ratingsCount": stats.get("ratingsCount") or 0,
        "description": strip_html(book.get('description({"stripped":true})') or book.get("description"), 700),
    }


def series_page(url):
    page = fetch(url)
    if not page:
        return None
    header = react_props(page, "SeriesHeader")
    title = None
    m = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
    if m:
        title = clean_ws(html.unescape(re.sub(r"<[^>]+>", "", m.group(1))))
    title = re.sub(r"\s+Series$", "", title or (header[0].get("title") if header else "") or "")
    entries = []
    for comp in react_props(page, "SeriesList"):
        for head, item in zip(comp.get("seriesHeaders") or [], comp.get("series") or []):
            b = small_book(item["book"])
            b["position"] = re.sub(r"^Book\s*", "", head or "").strip()
            entries.append(b)
    return {"title": title, "url": url, "entries": entries}


def author_list(author_id, n=30):
    page = fetch(f"{BASE}/author/list/{author_id}?sort=popularity&per_page={n}")
    if not page:
        return None
    rows = []
    for r in re.findall(r'<tr itemscope itemtype="http://schema.org/Book">(.*?)</tr>', page, re.S):
        bid = re.search(r'/book/show/(\d+)', r)
        name = re.search(r"<span itemprop='name' role='heading' aria-level='4'>(.*?)</span>", r, re.S)
        first_author = re.search(r'class="authorName" itemprop="url" href="[^"]*/author/show/(\d+)', r)
        img = re.search(r'class="bookCover" itemprop="image" src="([^"]+)"', r)
        rating = re.search(r"([\d.]+) avg rating &mdash; ([\d,]+) rating", r)
        year = re.search(r"published\s*(\d{4})", r)
        if not (bid and name):
            continue
        rows.append({
            "bookId": bid.group(1),
            "fullTitle": clean_ws(html.unescape(name.group(1))),
            "firstAuthorId": first_author.group(1) if first_author else None,
            "cover": cover_base(img.group(1) if img else None),
            "avgRating": float(rating.group(1)) if rating else None,
            "ratingsCount": int(rating.group(2).replace(",", "")) if rating else 0,
            "year": int(year.group(1)) if year else None,
        })
    return rows


def spanish_edition(work_id):
    """Edición en español más valorada de una obra (título y portada en español)."""
    page = fetch(f"{BASE}/work/editions/{work_id}?utf8=%E2%9C%93&sort=num_ratings&filter_by_language=spa")
    if not page:
        return None
    m = re.search(r'class="elementList clearFix">(.*?)class="actionLinkLite detailsLink"', page, re.S)
    if not m:
        return {}
    block = m.group(1)
    bid = re.search(r'/book/show/(\d+)', block)
    img = re.search(r'<img alt="([^"]*)"[^>]*src="([^"]+)"', block)
    lang = re.search(r"Edition language:\s*</div>\s*<div class=\"dataValue\">\s*([^<]+?)\s*<", block)
    if not (bid and img) or (lang and "Spanish" not in lang.group(1)):
        return {}
    return {"bookId": bid.group(1), "title": clean_ws(html.unescape(img.group(1))), "cover": cover_base(img.group(2))}


def localize(sug, refresh=False):
    """Si la sugerencia no está en español, usa la edición española (si existe)."""
    if (sug.get("language") or "").startswith("Spanish") or not sug.get("workId"):
        return sug
    ed = cached("es", sug["workId"], lambda: spanish_edition(sug["workId"]), refresh=refresh)
    if ed:
        sug = {**sug, "originalTitle": sug.get("title"), "bookId": ed["bookId"], "title": bare_title(ed["title"]),
               "fullTitle": ed["title"], "cover": ed.get("cover") or sug.get("cover"), "language": "Spanish"}
    return sug


def bare_title(t):
    """Quita sufijos como "(Dave Gurney, #4)" o "(Spanish Edition)"."""
    prev = None
    while prev != t:
        prev = t
        t = re.sub(r"\s*\((?:[^()]*#\s*\d[^()]*|[^()]*edition|[^()]*edici[oó]n[^()]*|panorama de narrativas)\)\s*$", "", t or "", flags=re.I)
    return t.strip()


def is_junk(title):
    return bool(PACK_RE.search(title or "") or JUNK_RE.search(title or ""))


def similar_books(work_id):
    page = fetch(f"{BASE}/book/similar/{work_id}")
    if not page:
        return None
    out = []
    for comp in react_props(page, "SimilarBooksList"):
        for item in comp.get("similarBooks") or []:
            out.append(small_book(item["book"]))
    return [b for b in out if b["workId"] != str(work_id)]


# --------------------------------------------------------------------------- construcción

def norm_title(t):
    t = re.sub(r"\(.*?\)", "", t or "")
    return slug(t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="vuelve a descargar las estanterías")
    ap.add_argument("--refresh-all", action="store_true", help="ignora toda la caché")
    args = ap.parse_args()
    rs = args.refresh or args.refresh_all
    ra = args.refresh_all

    # 1. Estanterías
    shelf_books = []
    for shelf in SHELVES:
        got = cached("shelf", shelf, lambda s=shelf: parse_shelf(s), refresh=rs) or []
        log(f"Estantería {shelf}: {len(got)} libros")
        shelf_books += got

    # 2. Detalle de cada libro propio
    books = {}
    for i, sb in enumerate(shelf_books, 1):
        log(f"[{i}/{len(shelf_books)}] {sb['title']}")
        det = cached("book", sb["bookId"], lambda: book_page(sb["bookId"]), refresh=ra) or {}
        b = {**det, **{k: v for k, v in sb.items() if v not in (None, "")}}
        b["title"] = bare_title(det.get("title") or re.sub(r"\s*\(.*?\)\s*$", "", sb["title"]))
        b["fullTitle"] = det.get("fullTitle") or sb["title"]
        b["cover"] = det.get("cover") or sb.get("rssCover")
        b["author"] = det.get("author") or sb["author"]
        b["authorId"] = det.get("authorId") or slug(sb["author"])
        b.update(AUTHOR_OVERRIDES.get(b["bookId"], {}))
        b["pages"] = det.get("pages") or sb.get("pages")
        b.setdefault("genres", [])
        b.setdefault("series", [])
        b["series"] = [s for s in b["series"] if not SERIES_BLOCKLIST.search(s["title"])]
        b.pop("rssCover", None)
        books[b["bookId"]] = b

    owned_works = {b["workId"] for b in books.values() if b.get("workId")}
    owned_ids = set(books)
    owned_titles = {norm_title(b["title"]) for b in books.values()}

    def is_owned(x):
        return (x.get("workId") and x["workId"] in owned_works) or x.get("bookId") in owned_ids

    # 3. Series
    series_out = []
    seen_series = set()
    for b in books.values():
        for s in b["series"]:
            if s["url"] in seen_series or SERIES_NAME_BLOCK.search(s["title"]):
                continue
            seen_series.add(s["url"])
            log(f"Serie: {s['title']}")
            sp = cached("series", s["url"], lambda: series_page(s["url"]), refresh=ra)
            if not sp:
                continue
            owned_in = [x for x in books.values() if any(ss["url"] == s["url"] for ss in x["series"])]
            owned_by_work = {x["workId"]: x for x in owned_in}
            entries = []
            seen_pos = set()
            for e in sp["entries"]:
                pos = e["position"]
                owned_book = owned_by_work.get(e["workId"])
                if not owned_book and not re.fullmatch(r"\d+", pos):
                    continue  # omnibus, relatos (#1.5)…: solo si ya los tienes
                if pos in seen_pos and not owned_book:
                    continue
                seen_pos.add(pos)
                if owned_book:
                    entries.append({"position": pos, "bookId": owned_book["bookId"]})
                else:
                    entries.append({"position": pos, "suggestion": localize(e, ra)})
            # libros propios de la serie que no aparecen en la página
            listed = {x.get("bookId") for x in entries}
            for x in owned_in:
                if x["bookId"] not in listed:
                    pos = next((ss["position"] for ss in x["series"] if ss["url"] == s["url"]), "")
                    entries.append({"position": pos, "bookId": x["bookId"]})
            entries.sort(key=lambda e: _posnum(e["position"]))
            if len(entries) < 2:
                continue
            series_out.append({
                "id": slug(s["title"]) + "-" + re.search(r"/series/(\d+)", s["url"]).group(1),
                "title": sp["title"] or s["title"],
                "url": s["url"],
                "entries": entries,
            })

    # 4. Autores: libros que faltan
    by_author = defaultdict(list)
    for b in books.values():
        by_author[b["authorId"]].append(b)
    owned_series_pos = {(x["url"], x["position"]) for b in books.values() for x in b["series"]}
    series_work_ids = {e["suggestion"]["workId"] for s in series_out for e in s["entries"] if "suggestion" in e}
    authors_out = []
    for aid, abooks in sorted(by_author.items(), key=lambda kv: -len(kv[1])):
        name = abooks[0]["author"]
        suggestions = []
        if aid.isdigit():
            log(f"Autor: {name}")
            rows = cached("author", aid, lambda: author_list(aid), refresh=ra) or []
            checked = 0
            seen_works = set()
            for r in rows:
                if len(suggestions) >= MAX_AUTHOR_SUGGESTIONS or checked >= MAX_AUTHOR_CHECKS:
                    break
                if r["firstAuthorId"] != aid or r["bookId"] in owned_ids or is_junk(r["fullTitle"]):
                    continue
                if r["ratingsCount"] < 150:
                    continue
                checked += 1
                det = cached("book", r["bookId"], lambda: book_page(r["bookId"]), refresh=ra)
                if not det or is_owned(det) or det["workId"] in seen_works:
                    continue
                if norm_title(det["title"]) in owned_titles or is_junk(det["fullTitle"]):
                    continue
                # mismo número de una serie que ya tienes (otra "obra" duplicada en Goodreads)
                if any((x["url"], x["position"]) in owned_series_pos for x in det.get("series", [])):
                    continue
                det = localize(det, ra)
                if NON_LATIN_RE.search(det["title"]) or norm_title(det["title"]) in owned_titles:
                    continue
                seen_works.add(det["workId"])
                suggestions.append(_suggestion(det))
        authors_out.append({
            "id": slug(name),
            "authorId": aid,
            "name": name,
            "image": next((x.get("authorImage") for x in abooks if x.get("authorImage")), None),
            "bookIds": [x["bookId"] for x in sorted(abooks, key=lambda x: (x.get("year") or 9999))],
            "suggestions": suggestions,
        })

    # 5. Recomendaciones a partir de "lectores también disfrutaron"
    read_books = [b for b in books.values() if b["shelf"] == "read" and b.get("workId")]
    cand = {}
    score = Counter()
    sources = defaultdict(set)
    for i, b in enumerate(read_books, 1):
        log(f"Similares [{i}/{len(read_books)}] {b['title']}")
        sims = cached("similar", b["workId"], lambda: similar_books(b["workId"]), refresh=ra) or []
        w = 1.0 + (0.6 * (b["userRating"] - 3) if b.get("userRating") else 0)
        for rank, s in enumerate(sims):
            if is_owned(s) or is_junk(s["fullTitle"]) or not s["workId"] or (s["ratingsCount"] or 0) < 300:
                continue
            cand.setdefault(s["workId"], s)
            score[s["workId"]] += max(w, 0.3) * (1.0 - rank / 40)
            sources[s["workId"]].add(b["bookId"])
    for wid in list(score):
        c = cand[wid]
        score[wid] *= 0.55 + 0.1 * math.log10((c["ratingsCount"] or 0) + 10)
        score[wid] *= 0.6 + 0.4 * ((c.get("avgRating") or 3.5) - 3)

    owned_author_names = {b["author"] for b in books.values()}
    ranked = [wid for wid, _ in score.most_common(SIMILAR_DETAIL_LIMIT)]
    recs = []
    for wid in ranked:
        c = cand[wid]
        det = cached("book", c["bookId"], lambda: book_page(c["bookId"]), refresh=ra) or {}
        r = _suggestion({**c, **{k: v for k, v in det.items() if v}})
        # no recomendar el tercer libro de una serie que no has empezado
        first_pos = next((s["position"] for s in r.get("series", [])), None)
        if first_pos and re.fullmatch(r"\d+", first_pos) and int(first_pos) > 1:
            continue
        if r["workId"] in series_work_ids:
            continue
        r = localize(r, ra)
        if NON_LATIN_RE.search(r["title"]) or is_junk(r.get("fullTitle")) or norm_title(r["title"]) in owned_titles:
            continue
        # libros *sobre* tus libros (guías, "Dan Brown's …")
        nt = norm_title(r.get("fullTitle") or r["title"])
        # mismo autor con otro nombre (p. ej. "Eva García Sáenz")
        if r.get("author") not in owned_author_names and any(
                slug(a).startswith(slug(r.get("author", "")) + "-") for a in owned_author_names):
            continue
        if any(len(t) > 8 and t in nt for t in owned_titles) or any(
                a != r.get("author") and slug(a) in nt for a in owned_author_names):
            continue
        r["score"] = round(score[wid], 3)
        r["because"] = sorted(sources[wid], key=lambda x: -books[x].get("userRating", 0))[:4]
        recs.append(r)

    data = {
        "user": {"id": USER_ID, "name": USER_NAME, "profile": f"{BASE}/review/list/{USER_ID}"},
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "books": sorted(books.values(), key=lambda b: b.get("dateAdded") or "", reverse=True),
        "authors": authors_out,
        "series": series_out,
        "recommendations": recs,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):  # conserva la fecha si nada ha cambiado (evita commits vacíos)
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        if {**old, "generatedAt": None} == {**data, "generatedAt": None}:
            data["generatedAt"] = old["generatedAt"]
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"\nOK → {os.path.relpath(OUT, ROOT)}: {len(books)} libros, {len(authors_out)} autores, "
        f"{len(series_out)} series, {len(recs)} recomendaciones")


def _posnum(p):
    m = re.match(r"(\d+(?:\.\d+)?)", p or "")
    return float(m.group(1)) if m else 999


def _suggestion(d):
    keep = ["bookId", "workId", "title", "fullTitle", "authorId", "author", "cover", "genres", "series",
            "pages", "year", "avgRating", "ratingsCount", "description", "language", "originalTitle"]
    out = {k: d.get(k) for k in keep if d.get(k) not in (None, "", [])}
    out["title"] = bare_title(out.get("title"))
    if "series" in out:
        out["series"] = [s for s in out["series"] if not SERIES_BLOCKLIST.search(s["title"])]
    return out


if __name__ == "__main__":
    main()
