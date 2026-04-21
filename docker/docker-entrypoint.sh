#!/bin/bash
set -e

echo "============================================"
echo "  Check-in Work System - Entry Point"
echo "============================================"
echo ""

# Wait for database to be ready
echo "Waiting for database..."
until mysql -h"$DB_HOST" -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1" > /dev/null 2>&1; do
    echo -n "."
    sleep 2
done
echo ""
echo "Database is ready!"

# Run any additional initialization scripts here
echo ""
echo "Starting application..."
exec "$@"
