@echo off
REM PROPUESTA COTS: crea tablas y carga distritos en la BD indicada en .env.
chcp 65001 > nul
cd /d "%~dp0"
if not exist "node_modules\pg" (
  echo Faltan dependencias. Ejecuta primero: npm install
  exit /b 1
)
call npm run db:init
if errorlevel 1 (
  echo ERROR: no se completo la inicializacion.
  exit /b 1
)
echo Base remota inicializada correctamente.
