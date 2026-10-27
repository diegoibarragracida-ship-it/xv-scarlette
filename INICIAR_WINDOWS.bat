@echo off
chcp 65001 >nul
title XV Scarlette - servidor local
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas instalar Node.js: https://nodejs.org
  pause
  exit /b
)

if not exist node_modules (
  echo Instalando dependencias, espera un momento...
  call npm install
)

REM Cierra cualquier servidor anterior que siga abierto en el puerto 3000
REM (si queda uno viejo, el panel usaria OTRA contrasena)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>nul

REM Contrasena SOLO para probar en tu computadora. Cambiala antes de publicar.
set ADMIN_PASSWORD=scarlette2026
set PORT=3000

echo.
echo  ============================================
echo   Panel:       http://localhost:3000/panel
echo   Contrasena:  scarlette2026
echo  ============================================
echo  Deja esta ventana abierta mientras pruebas. Cierra con Ctrl+C.
echo.
start "" http://localhost:3000/panel
node server.js
pause
