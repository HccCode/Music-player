@echo off
title Lanzador - Panel de Control Musical
echo ==================================================
echo   Iniciando Backend y Frontend Musical...
echo ==================================================

:: 1. Arrancar Backend en una ventana minimizada
start "Musica Backend (Puerto 3001)" /min cmd /k "cd /d %~dp0musica-backend && node server.js"

:: 2. Arrancar Frontend Vite (--host para que funcione el QR movil)
start "Musica Frontend (Puerto 5173)" /min cmd /k "cd /d %~dp0musica-frontend && npm run dev -- --host"

:: 3. Esperar 3 segundos y abrir el navegador automaticamente
timeout /t 3 /nobreak >nul
start http://127.0.0.1:5173

echo Listo! El panel se ha abierto en tu navegador.
exit