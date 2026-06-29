@echo off
title 注文・整理券管理システム サーバー起動
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File server.ps1
pause
