#!/bin/bash
set -e
cd "$(dirname "$0")/backend"

if [ -f ../.env ]; then
  export $(cat ../.env | grep -v '^#' | xargs)
fi

pip install -r requirements.txt -q
uvicorn main:app --reload --host 0.0.0.0 --port 8000
