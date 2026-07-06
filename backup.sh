#!/bin/bash
set -e

CONTAINER="bpm_postgres"
DB_USER="postgres"
DB_NAME="bpm_primes_db"
BACKUP_DIR="backups"

mkdir -p "$BACKUP_DIR"

usage() {
  echo "Usage: $0 {backup|restore|list}"
  echo "  backup              Create a new database dump"
  echo "  restore <file>      Restore from a dump file"
  echo "  list                List available backups"
  exit 1
}

cleanup_old() {
  local keep=5
  local count
  count=$(ls -1 "$BACKUP_DIR"/dump-*.sql 2>/dev/null | wc -l)
  if [ "$count" -gt "$keep" ]; then
    ls -1t "$BACKUP_DIR"/dump-*.sql | tail -n $((count - keep)) | while read old; do
      rm -f "$old"
      echo "  Removed old backup: $old"
    done
  fi
}

case "${1:-}" in
  backup)
    FILE="$BACKUP_DIR/dump-${DB_NAME}-$(date +%Y%m%d%H%M%S).sql"
    echo "Creating backup: $FILE"
    docker exec -t "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$FILE"
    echo "Backup created: $(wc -c < "$FILE") bytes"
    cleanup_old
    ;;
  restore)
    FILE="${2:-}"
    if [ -z "$FILE" ]; then
      echo "Error: specify a dump file to restore"
      echo "Usage: $0 restore <file>"
      exit 1
    fi
    if [ ! -f "$FILE" ]; then
      echo "Error: file not found: $FILE"
      exit 1
    fi
    echo "Restoring from: $FILE"
    docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" < "$FILE"
    echo "Restore complete"
    ;;
  list)
    echo "Available backups:"
    ls -1t "$BACKUP_DIR"/dump-*.sql 2>/dev/null || echo "  (none)"
    ;;
  *)
    usage
    ;;
esac
