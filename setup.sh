#!/bin/sh
set -eu

npm install

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
fi

printf 'Proyecto listo. Ejecuta: npm start\n'
