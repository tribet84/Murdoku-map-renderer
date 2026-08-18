# 🔎 Murdoku · Mapa digital

Aplicación web **100% estática** para resolver los puzles *Murdoku* (los sudokus de asesinatos
de los libros de Murdle) sin escribir en el libro.

## Cómo funciona

Un asistente en 4 pasos:

1. **Tamaño** — elige la cuadrícula (de 4×4 a 12×12). Los personajes se crean solos:
   una letra por fila (A, B, C…) y la víctima siempre es la **V**.
2. **Habitaciones** — añade habitaciones y píntalas arrastrando por el mapa.
3. **Muebles** — coloca **obstáculos** (tachan su casilla: ahí no puede haber nadie),
   **sillas** y **camas** (en estas sí se puede estar, como dicen las pistas del libro).
4. **Resolver** — toca una letra y su casilla: su fila y su columna se tachan solas con ✕.
   Los conflictos (dos letras en la misma fila/columna o alguien sobre un obstáculo) se
   marcan en rojo. También puedes tachar casillas a mano para tus deducciones, y apuntar
   la respuesta en *«El asesino es…»*.

Todo se guarda solo en el navegador (`localStorage`). Viene precargado el mapa de ejemplo
del libro (Baño, Cocina, Cuarto de invitados, Comedor, Dormitorio y Salón).

## Cómo usarla en local

No necesita instalación ni build: abre `index.html` en el navegador, o sirve la carpeta con
cualquier servidor estático (`python3 -m http.server`).

## Despliegue

Se despliega automáticamente en GitHub Pages con cada push (workflow en
`.github/workflows/deploy-pages.yml`).
