@echo off
title Assistant IA Notion
echo.
echo  ╔═══════════════════════════════════════════════╗
echo  ║   🚀 Démarrage de l'Assistant IA Notion...   ║
echo  ╚═══════════════════════════════════════════════╝
echo.

cd /d "%~dp0"

REM Lancer le serveur Python en arrière-plan
start /B pythonw app.py

REM Attendre 2 secondes que le serveur démarre
timeout /t 2 /nobreak >nul

REM Ouvrir le navigateur
start http://127.0.0.1:5000

echo  ✅ Serveur lancé sur http://127.0.0.1:5000
echo  ✅ Navigateur ouvert automatiquement
echo.
echo  Pour arrêter le serveur, fermez cette fenêtre.
echo.
pause
