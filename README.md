# 🔎 Murdoku · Mapa digital

Aplicación web **100% estática** para resolver los puzles *Murdoku* (los sudokus de asesinatos
de los libros de Murdle) sin escribir en el libro.

## Cómo funciona

Un asistente en 4 pasos:

1. **Tamaño** — elige filas y columnas por separado (el mapa no tiene por qué ser
   cuadrado). Los personajes se crean solos: una letra (A, B, C…) por cada lado más
   corto del mapa, y la víctima siempre es la **V**.
2. **Habitaciones** — añade habitaciones y píntalas arrastrando por el mapa.
3. **Muebles** — coloca **obstáculos** (tachan su casilla: ahí no puede haber nadie),
   **sillas**, **camas** y **alfombras** (en estas sí se puede estar, como dicen las
   pistas del libro).
4. **Resolver** — toca una letra y su casilla para confirmarla: su fila y su columna se
   tachan solas con ✕. Los conflictos (dos letras en la misma fila/columna o alguien
   sobre un obstáculo) se marcan en rojo. Con **«¿Quizá aquí?»** activo puedes marcar
   varias casillas posibles para la misma letra —y varias letras en la misma casilla—
   sin que cuenten como confirmadas ni disparen el tachado automático; al confirmar una
   letra en una casilla, sus «quizás» se limpian solos. También puedes tachar casillas
   a mano para tus deducciones, y apuntar la respuesta en *«El asesino es…»*.

Todo se guarda solo en el navegador (`localStorage`). Viene precargado el mapa de ejemplo
del libro (Baño, Cocina, Cuarto de invitados, Comedor, Dormitorio y Salón).

## Cómo usarla en local

No necesita instalación ni build: abre `index.html` en el navegador, o sirve la carpeta con
cualquier servidor estático (`python3 -m http.server`).

## Despliegue

Se despliega automáticamente en GitHub Pages con cada push (workflow en
`.github/workflows/deploy-pages.yml`).
