# 🔎 Murdoku · Mapa digital

**👉 Úsala aquí: https://tribet84.github.io/Murdoku-map-renderer/**

Aplicación web **100% estática** para resolver los puzles *Murdoku* (los sudokus de asesinatos
de los libros de Murdle) sin escribir en el libro. Dibujas el plano en un minuto, colocas a
los personajes y la app tacha filas, columnas y muebles por ti. Gratis, sin cuenta, y una vez
cargada funciona sin conexión.

> Herramienta no oficial hecha por un aficionado. No tiene relación con el autor ni con la
> editorial de Murdle, y no incluye ningún caso de los libros: el mapa de ejemplo es inventado.

*English: an unofficial companion web app for solving Murdle's "Murdoku" puzzles without
writing in the book. Draw the floor plan, place the suspects, and the app crosses out rows,
columns and furniture for you. Free, no account, works offline. Spanish UI.*

## Cómo funciona

Un asistente en 4 pasos:

1. **Tamaño** — elige filas y columnas por separado (el mapa no tiene por qué ser
   cuadrado). Los personajes se crean solos: una letra (A, B, C…) por cada lado más
   corto del mapa, y la víctima siempre es la **V**.
2. **Habitaciones** — añade habitaciones y píntalas arrastrando por el mapa. El botón
   **«Última (rellena huecos)»** crea la habitación final y la asigna de golpe a todas
   las casillas que aún no tengan una, para no tener que pintarla a mano.
3. **Muebles** — coloca **obstáculos** (tachan su casilla: ahí no puede haber nadie),
   **sillas**, **camas** y **alfombras** (en estas sí se puede estar, como dicen las
   pistas del libro) y **ventanas** en las paredes (toca cerca del borde de la casilla,
   en el lado donde va). Dos camas o dos alfombras contiguas de la misma habitación se
   dibujan unidas, como una sola pieza. Las alfombras son una capa por debajo, así que
   puedes poner un obstáculo (una planta, una mesa…) o una silla encima sin perderlas;
   **Borrar** quita primero lo de encima y, si solo queda la alfombra, la alfombra.
4. **Resolver** — un cronómetro ⏱️ empieza a contar en cuanto llegas a este paso, se
   pausa si te vas a otro paso y se congela al terminar. Toca una letra y su casilla
   para confirmarla: su fila y su columna se tachan solas con ✕. Los conflictos (dos
   letras en la misma fila/columna o alguien sobre un obstáculo) se marcan en rojo. Con
   **«¿Quizá aquí?»** activo puedes marcar varias casillas posibles para la misma letra
   —y varias letras en la misma casilla— sin que cuenten como confirmadas ni disparen el
   tachado automático; al confirmar una letra en una casilla, sus «quizás» se limpian
   solos. Tachar una casilla a mano también quita cualquier «quizá» que hubiera en ella.
   Cuando todos los personajes (incluida la víctima) están colocados sin conflictos,
   salta un confeti — y puedes apuntar la respuesta en *«El asesino es…»*.

El mapa lleva numeradas las filas y columnas (1, 2, 3…) en los bordes, para poder
describir una casilla en voz alta sin ambigüedad.

Los botones **↩️ Deshacer** y **↪️ Rehacer** de la cabecera funcionan en cualquier paso:
colocar o quitar una letra, un trazo entero de pintar habitación o mueble, tachar una
casilla, añadir/renombrar/borrar una habitación, cambiar filas o columnas, etc. Un cambio
nuevo descarta lo que hubiera para rehacer.

**🔁 Volver a jugar**, en el paso Resolver, deja el mapa intacto y pone la partida a cero
en un toque: quita letras, «quizás», tachaduras y respuesta, y el cronómetro vuelve a 00:00.

## 🗓️ Caso del día

El botón **Caso del día** abre un caso nuevo cada día, el mismo para todo el mundo, sin
servidor: el plano, los muebles, la solución y las pistas se generan a partir de la fecha.
Cada sospechoso tiene una o dos pistas al estilo del libro («estaba junto a una planta»,
«estaba en la misma habitación que D», «estaba delante de una ventana»…), la víctima
siempre «estaba a solas con el asesino», y un resolutor garantiza que el caso tiene una
única solución antes de dárselo a nadie.

Se resuelve colocando a cada persona en su casilla. **Comprobar** te dice cuántas están bien
sin decir cuáles. Al acertar todas salta el confeti, se muestra quién es el asesino y puedes
**compartir** el resultado con tu tiempo, tu racha y una cuadrícula de emojis, como en Wordle.
El enlace `…/#dia` lleva directamente al caso del día. Los casos, personajes y pistas son
propios y se generan al vuelo: no salen del libro.

Los obstáculos de tus propios mapas también pueden llevar tipo (**planta**, **mesa**,
**estantería**) desde el paso Muebles, para que el plano se lea como el del libro.

## Varios mapas

**📚 Mapas** abre tu biblioteca: un mapa por cada caso del libro, con nombre. Desde ahí
puedes crear uno nuevo, abrir otro, duplicarlo, renombrarlo o borrarlo. La cabecera muestra
siempre qué mapa tienes abierto. Todo se guarda solo en el navegador (`localStorage`);
la primera vez viene el mapa de ejemplo del libro (Baño, Cocina, Cuarto de invitados,
Comedor, Dormitorio y Salón).

## Instalar en el móvil

Es una PWA: en el navegador del móvil, «Añadir a la pantalla de inicio» la instala con su
icono y se abre a pantalla completa. Una vez cargada, funciona también sin conexión.

## Cómo usarla en local

No necesita instalación ni build: abre `index.html` en el navegador, o sirve la carpeta con
cualquier servidor estático (`python3 -m http.server`).

## Despliegue

Se despliega automáticamente en GitHub Pages con cada push (workflow en
`.github/workflows/deploy-pages.yml`).
