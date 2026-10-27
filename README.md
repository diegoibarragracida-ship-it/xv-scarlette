# XV años Scarlette Sahori — Rapunzel

Invitación digital + muro de fotos + panel de la festejada. Node 18+, sin base de datos externa.

## Correr local en Windows (lo más fácil)
1. **Extrae todo el .zip** a una carpeta (no lo abras desde WinRAR).
2. Doble clic en `INICIAR_WINDOWS.bat` (necesita Node.js). Abre el panel solo: http://localhost:3000/panel · contraseña de prueba `scarlette2026` (cámbiala al publicar).
3. En el panel agrega invitados y copia/envía el link de cada uno.

## Correr local (terminal)
```bash
npm install
ADMIN_PASSWORD=tu_clave npm start
```
- Panel: http://localhost:3000/panel
- Cada invitado tiene su link personal `/i/<token>` (se genera en el panel).
- Muro: http://localhost:3000/muro/<codigo> (el código aparece en la pestaña "Muro de fotos").

## Variables de entorno
| Variable | Para qué |
|---|---|
| `ADMIN_PASSWORD` | Contraseña del panel (obligatoria en producción) |
| `WALL_CODE` | Código fijo del link del muro (opcional) |
| `DATA_DIR` | Carpeta de datos y fotos. En Render apúntala a un disco persistente, ej. `/var/data` |
| `PORT` | Lo pone la plataforma |

## Subir a GitHub
```bash
git init
git add .
git commit -m "XV Scarlette: invitación, muro de fotos y panel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/xv-scarlette-rapunzel.git
git push -u origin main
```

## Render
Web Service · Build: `npm install` · Start: `npm start` · añade un Disk montado en `/var/data` y `DATA_DIR=/var/data`, `ADMIN_PASSWORD=...`.
Sin disco persistente las fotos y la lista se pierden en cada deploy.

## Pendiente de personalizar
- Fotos reales de Scarlette en `public/index.html` (sección hero y galería).
- Dirección exacta del Salón Carrera (mapa).

## Fotos
Están en `public/fotos`. El fondo de la invitación es `fondo-rapunzel.jpg`. El carrusel "De pequeñita a quinceañera" se edita en la lista `FOTOS` de `public/index.html` (orden y pies de foto). Para agregar la foto actual de Scarlette: guárdala en `public/fotos` y añade una línea a `FOTOS`.

## Publicar
Mira `DEPLOY.md` (Render, con `render.yaml`).
