# Publicar en Render (paso a paso)

> Usa un repositorio **PRIVADO**: lleva fotos de Scarlette, la canción y el mosaico.
> El plan gratuito de Render borra sus archivos en cada despliegue y reinicio, por eso la lista de invitados,
> las confirmaciones y las fotos del muro se guardan en **Supabase** (gratis). Ver el paso 2.

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
2. Render lee `render.yaml`. Te pide cuatro valores:
   - `ADMIN_PASSWORD`: una contraseña tuya (NO uses `scarlette2026`).
   - `WALL_CODE`: texto sin espacios, ej. `scarlette-xv-2026` (queda en el link del muro).
   - `SUPABASE_URL` y `SUPABASE_KEY`: ver "Crear el almacenamiento en Supabase" abajo.
3. **Apply**. Espera a que diga *Live*.

(Si prefieres hacerlo a mano: New + → Web Service → Build `npm install`, Start `npm start`, plan Free,
y en Environment las variables `ADMIN_PASSWORD`, `WALL_CODE`, `SUPABASE_URL`, `SUPABASE_KEY`.
Ya no se usa `DATA_DIR` ni disco.)

### Crear el almacenamiento en Supabase (gratis, una sola vez)
1. supabase.com → **Start your project** → crea cuenta → **New project** (nombre `xv-scarlette`, una contraseña cualquiera, región cercana, plan Free).
2. Cuando termine de crearse: **Project Settings → API** (o *API Keys*).
   - Copia **Project URL** (`https://xxxx.supabase.co`) → es `SUPABASE_URL`.
   - Copia la llave **service_role** (pestaña *Legacy API keys*) o la **secret key** → es `SUPABASE_KEY`. Es secreta: solo va en Render, nunca en GitHub.
3. En Render → tu servicio → **Environment** → agrega esas dos variables → **Save**. Se reinicia solo.
4. No hay que crear tablas ni carpetas: la app crea sola un bucket privado llamado `xv-scarlette`.
   En los logs de Render debe aparecer "Supabase conectado" o "Datos cargados desde Supabase".

Límites del plan gratuito de Supabase: 1 GB de archivos y 50 MB por foto o video (el muro avisa si pasan de 50 MB).
Un proyecto gratis se **pausa tras 7 días sin actividad**: entra al panel al menos una vez por semana hasta la fiesta, y revisa
en supabase.com que no diga *Paused* (si lo dice, pulsa *Restore*; no se pierde nada).
Render gratis también duerme el sitio tras 15 min sin visitas y la primera visita tarda ~1 minuto en despertar:
abre el link tú mismo un rato antes de la fiesta.

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
Render vuelve a desplegar solo; los datos están en Supabase y no se borran.

## 6. Respaldo
Panel → Muro de fotos → **Descargar todas las fotos (ZIP)** y **Excel (CSV)** de invitados. Hazlo al terminar la fiesta.
