#!/bin/bash
set -e

# Concatenate all migrations and run them in order
for f in /migrations/*.sql; do
  echo "Running migration: $f"
  psql -U postgres -d bal_test -f "$f"
done
