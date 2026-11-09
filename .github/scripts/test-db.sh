#!/usr/bin/env bash
# CI only: the test database, the owner role migrations run as, and the app role (br_app),
# which owns nothing so row-level security applies to it. Same layout as docs/STRATEGY.md.
set -euo pipefail
export PGPASSWORD=postgres
psql_su() { psql -h localhost -U postgres -v ON_ERROR_STOP=1 -c "$1"; }
psql_su "CREATE ROLE br_owner LOGIN PASSWORD 'br_owner_ci' CREATEROLE"
psql_su "CREATE DATABASE breakrecords_test OWNER br_owner"
MIGRATION_DATABASE_URL="postgres://br_owner:br_owner_ci@localhost:${PGPORT:-5432}/breakrecords_test?sslmode=disable" pnpm --filter @breakrecords/db migrate
psql_su "ALTER ROLE br_app LOGIN PASSWORD 'br_app_ci'"
