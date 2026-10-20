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

REM Contrasena SOLO para probar en tu computadora. Cambiala antes de publicar.
set ADMIN_PASSWORD=scarlette2026
set PORT=3000

echo.
echo  Panel:      http://localhost:3000/panel   (contrasena: %ADMIN_PASSWORD%)
echo  Invitacion: se genera por invitado desde el panel
echo  Deja esta ventana abierta mientras pruebas. Cierra con Ctrl+C.
echo.
start "" http://localhost:3000/panel
node server.js
pause
