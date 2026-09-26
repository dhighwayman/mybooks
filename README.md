# La biblioteca de David

Mis libros de [Goodreads](https://www.goodreads.com/review/list/79173731-david) convertidos en una web estática e interactiva para GitHub Pages:

- **Pilas de libros en 3D** con las portadas, agrupadas por **autor**, **serie** (por ejemplo *Antonia Scott* o *Universo Reina Roja*) o **género**.
- Al pulsar una pila, la cámara **hace zoom** sobre ella y los libros salen volando a una estantería.
- En cada autor o serie aparece **lo que te falta**: los números de la serie que no tienes y los libros populares del autor que no están en tu Goodreads.
- **Pilas nuevas para ti** (✦): recomendaciones por autor ("Si te gusta Juan Gómez-Jurado"), por género ("Más thriller"), series para empezar, autores nuevos y el siguiente libro de cada serie empezada.
- Ficha de cada libro, búsqueda, orden, enlaces compartibles (`#/serie/antonia-scott-375487`) y soporte de teclado (`Esc` para volver).

## Estructura

```
index.html            página única
assets/style.css      estilos (pilas 3D con CSS, sin librerías)
assets/app.js         lógica y animaciones (JavaScript sin dependencias)
data/library.json     datos estáticos generados desde Goodreads
scripts/build_data.py genera data/library.json
```

## Actualizar los datos

Los datos son estáticos. Para refrescarlos:

```bash
python3 scripts/build_data.py --refresh   # vuelve a leer tus estanterías
git add data/library.json && git commit -m "Actualiza libros" && git push
```

El script solo usa la biblioteca estándar de Python. Lee el RSS público de las estanterías `read`, `currently-reading` y `to-read`, y después las páginas públicas de cada libro, serie, autor y "lectores también disfrutaron". Guarda lo descargado en `.cache/` (ignorado por git), así que las siguientes ejecuciones solo piden lo nuevo. `--refresh-all` descarga todo otra vez.

También hay un workflow opcional (`.github/workflows/update-data.yml`) que hace lo mismo cada lunes o a mano desde la pestaña *Actions*. Si Goodreads bloquea los servidores de GitHub, basta con ejecutar el script en local.

## Publicar en GitHub Pages

La web se publica con el workflow `.github/workflows/pages.yml` en cada push a `main` (y después de cada actualización automática de datos). Hay que activarlo una vez: *Settings → Pages → Build and deployment → Source: GitHub Actions*. La web quedará en `https://dhighwayman.github.io/mybooks/`.

Al publicar, el workflow escribe en la página el commit publicado (se ve en el pie: *Versión abc1234 · fecha*) y añade `?v=<commit>` a los ficheros para que el navegador no mezcle versiones. Si la página que ves está en caché y ya hay una versión más nueva, el pie lo avisa con un botón para recargar.

### App instalable (PWA)

La web es una PWA: en Android/Chrome aparece un botón **Instalar la app** en el pie (o en el menú del navegador → *Instalar aplicación*); en iPhone, Safari → *Compartir* → *Añadir a pantalla de inicio*. Se abre a pantalla completa, con icono propio y accesos directos a *Para ti* y *Series*.

El service worker (`sw.js`) guarda la web, los datos, las portadas y las fuentes, así que también funciona sin conexión. La página se pide siempre primero a la red (para ver la última versión) y cada publicación usa su propia caché, que sustituye a la anterior.

Para probarla en local: `python3 -m http.server` y abre <http://localhost:8000> (el pie dirá *Versión local*).
