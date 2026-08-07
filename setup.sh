#!/usr/bin/env bash
# ============================================================
#  Saa Kenya - MariaDB setup script
#  Creates the database, the app user and loads schema + seed.
#
#  Usage:  npm run setup-db     (or)   bash setup.sh
#
#  Notes:
#   - Connects to the local MariaDB socket as an admin user
#     (default: root via unix_socket auth), falling back to
#     `sudo mysql` when the current user has no direct access.
#   - Set MYSQL_USER / MYSQL_PASS to override the admin login.
#   - ALLOW_SUDO=0 disables the sudo fallback.
# ============================================================
set -euo pipefail

# --- Read .env if present (keep overrides in shell as fallback) ---
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a; . ./.env; set +a
fi

DB_NAME="${DB_NAME:-watch_store}"
DB_USER="${DB_USER:-watch_user}"
DB_PASSWORD="${DB_PASSWORD:-watch_pass}"

# Admin login used to create the DB and user (local socket, unix_socket auth friendly)
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASS="${MYSQL_PASS:-}"
ALLOW_SUDO="${ALLOW_SUDO:-1}"

echo "==> Connecting to MariaDB (local socket) as '$MYSQL_USER'..."

# --- run_admin_sql <sql> : run SQL as the admin user, with sudo fallback ---
run_admin_sql() {
  local sql="$1"
  local args=(-u "$MYSQL_USER")
  if [ -n "$MYSQL_PASS" ]; then
    args+=(-p"$MYSQL_PASS")
  fi

  if mysql "${args[@]}" -e "$sql"; then
    return 0
  fi

  if [ "$ALLOW_SUDO" = "1" ] && command -v sudo >/dev/null 2>&1; then
    echo "==> Direct access failed; retrying with sudo (you may be asked for your password)..."
    sudo mysql "${args[@]}" -e "$sql"
    return $?
  fi

  return 1
}

# --- Create database + user (idempotent) ---
run_admin_sql "
CREATE DATABASE IF NOT EXISTS \`$DB_NAME\`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
ALTER USER '$DB_USER'@'%' IDENTIFIED BY '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'%';
FLUSH PRIVILEGES;
"

echo "==> Database '$DB_NAME' and user '$DB_USER' ready."

# --- Load schema + seed data ---
if ! mysql -u "$MYSQL_USER" ${MYSQL_PASS:+-p"$MYSQL_PASS"} < schema.sql; then
  if [ "$ALLOW_SUDO" = "1" ] && command -v sudo >/dev/null 2>&1; then
    sudo mysql -u "$MYSQL_USER" ${MYSQL_PASS:+-p"$MYSQL_PASS"} < schema.sql
  else
    exit 1
  fi
fi

echo "==> Schema loaded into '$DB_NAME'."
echo ""
echo "Done! Start the app with:  npm start"
echo "Storefront: http://localhost:${PORT:-3000}   Admin: http://localhost:${PORT:-3000}/admin.html"
