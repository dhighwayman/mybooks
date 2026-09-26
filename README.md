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

*Settings → Pages → Build and deployment → Deploy from a branch*, elige la rama `main` y la carpeta `/ (root)`. La web quedará en `https://<usuario>.github.io/mybooks/`.

Para probarla en local: `python3 -m http.server` y abre <http://localhost:8000>.
