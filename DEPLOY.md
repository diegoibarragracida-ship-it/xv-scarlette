# Publicar en Render (paso a paso)

> Usa un repositorio **PRIVADO**: lleva fotos de Scarlette, la canción y el mosaico.
> Sin disco persistente las fotos del muro y la lista de invitados se borran en cada despliegue,
> por eso el plan gratuito de Render NO sirve para esto.

## 1. Subir a GitHub (en la carpeta del proyecto)
```bash
git init
git add .
git commit -m "XV Scarlette: invitación, muro de fotos y panel"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/xv-scarlette-rapunzel.git
git push -u origin main
```
(Crea antes el repo vacío y **privado** en github.com → New repository.)

## 2. Crear el servicio en Render
1. render.com → **New + → Blueprint** → elige el repo `xv-scarlette-rapunzel`.
2. Render lee `render.yaml`. Te pide dos valores:
   - `ADMIN_PASSWORD`: una contraseña tuya (NO uses `scarlette2026`).
   - `WALL_CODE`: texto sin espacios, ej. `scarlette-xv-2026` (queda en el link del muro).
3. **Apply**. Espera a que diga *Live*.

(Si prefieres hacerlo a mano: New + → Web Service → Build `npm install`, Start `npm start`,
añade un **Disk** con Mount Path `/var/data` y las variables `DATA_DIR=/var/data`, `ADMIN_PASSWORD`, `WALL_CODE`.)

## 3. Primer uso
1. Abre `https://TU-SERVICIO.onrender.com/panel` y entra con tu contraseña.
2. **Importar lista** (nombre, pases, teléfono, mesa) o agrega invitados uno por uno.
3. Botón 💬 por invitado: abre WhatsApp con su link personal listo.
4. Pestaña **Muro de fotos**: copia el link del muro e imprime su QR para las mesas.

## 4. Antes de mandar invitaciones
- **Decide el dominio definitivo.** Los links y los QR llevan la dirección actual; si luego cambias de
  dirección (por ejemplo a un dominio propio), los ya enviados e impresos dejan de servir. Si quieres dominio propio,
  conéctalo en Render → Settings → Custom Domains **antes** de enviar.
- Manda una invitación de prueba a tu propio WhatsApp y revisa: portada, música, RSVP, botón del muro.
- Prueba subir una foto al muro desde tu celular.

## 5. Actualizar después
```bash
git add .
git commit -m "Cambios en la invitación"
git push
```
Render vuelve a desplegar solo; los datos del disco no se borran.

## 6. Respaldo
Panel → Muro de fotos → **Descargar todas las fotos (ZIP)** y **Excel (CSV)** de invitados. Hazlo al terminar la fiesta.
