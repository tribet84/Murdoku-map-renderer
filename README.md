# 🔎 Murdoku · Mapa digital

Aplicación web **100% estática** para resolver los puzles *Murdoku* (los sudokus de asesinatos
de los libros de Murdle) sin escribir en el libro.

## Qué hace

- **Modo resolver 🧩**: elige un personaje y toca la casilla donde crees que está.
  - Su **fila y su columna se tachan automáticamente** con ✕.
  - Las casillas con **muebles que bloquean** (mesas, plantas, estanterías…) también aparecen
    tachadas y no se puede colocar a nadie encima.
  - Las **camas y sillas no bloquean**, porque las pistas dicen cosas como *«estaba sobre una
    cama»* o *«sentada en una silla»* (se puede cambiar en Opciones).
  - También puedes **tachar casillas a mano** para tus deducciones, y los conflictos
    (dos personajes en la misma fila/columna) se marcan en rojo.
  - Hay un cuadro de **notas** para apuntar las pistas y un campo *«El asesino es…»*.
- **Modo editar ✏️**: crea el mapa de cualquier puzle del libro.
  - Sube la **foto del mapa** como fondo semitransparente y «cálcala»: pinta las habitaciones
    arrastrando, coloca los muebles (cama, silla, mesa, planta, estantería…) y las ventanas
    (tocando cerca del borde de la casilla).
  - Cambia el tamaño de la cuadrícula, los nombres y colores de habitaciones y personajes.
- **Exportar / importar** puzles como JSON, y todo se guarda solo en el navegador
  (`localStorage`), así que puedes cerrar la pestaña y seguir después.
- Viene **precargado el puzle de ejemplo** (Baño, Cocina, Cuarto de invitados, Comedor,
  Dormitorio y Salón, con Ashton, Bruce, Charlotte, Dakota, Ethan, Fanny, Gloria, Hazel y Vin ☠).

## Cómo usarla en local

No necesita instalación ni build: abre `index.html` en el navegador, o sirve la carpeta con
cualquier servidor estático (`python3 -m http.server`).

## Desplegar en GitHub Pages

1. Ve a **Settings → Pages** del repositorio.
2. En *Build and deployment*, elige **Deploy from a branch**.
3. Selecciona la rama (por ejemplo `main`) y la carpeta `/ (root)`.
4. Guarda: en un minuto la app estará en `https://<usuario>.github.io/<repositorio>/`.
