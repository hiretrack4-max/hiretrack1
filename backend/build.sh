#!/usr/bin/env bash
# Render build step for the HireTrack Django API.
# Runs on every deploy: install deps, collect static assets (served by
# WhiteNoise), and apply database migrations against the configured Postgres
# (Neon in production).
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate --no-input
