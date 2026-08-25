import socket
import time
import os
import subprocess
import shutil

db_host = os.getenv("DB_HOST", "db")
db_port = int(os.getenv("DB_PORT", "5432"))

print(f"Waiting for database at {db_host}:{db_port}...")

while True:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((db_host, db_port))
        sock.close()
        print("Database is ready!")
        break
    except socket.error:
        print("Database not ready, waiting...")
        time.sleep(1)

print("Running migrations...")
result = subprocess.run(["aerich", "upgrade"], capture_output=True, text=True)
if result.returncode == 0:
    print(result.stdout.strip())
else:
    print("Fresh database detected, initializing...")
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
    if os.path.exists(migrations_dir):
        shutil.rmtree(migrations_dir)
    init_result = subprocess.run(["aerich", "init-db"], capture_output=True, text=True)
    print(init_result.stdout.strip())
    if init_result.returncode != 0:
        print(f"Error: {init_result.stderr}")

print("Ensuring evaluation_template table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "evaluationtemplate" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "section" VARCHAR(20) NOT NULL,
            "criteria_name" VARCHAR(255) NOT NULL,
            "description" VARCHAR(255),
            "coeff" DECIMAL(5,1) NOT NULL,
            "sort_order" INT NOT NULL DEFAULT 0,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "employee_id" INT NOT NULL REFERENCES "employee" ("id") ON DELETE CASCADE
        );
    """)
    # Migration: handle old column names (department_id or user_id) -> employee_id
    cur.execute("""
        DO $$
        BEGIN
            -- Case 1: old department_id column exists
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'evaluationtemplate' AND column_name = 'department_id'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'evaluationtemplate' AND column_name = 'employee_id'
                ) THEN
                    ALTER TABLE "evaluationtemplate" ADD COLUMN "employee_id" INT REFERENCES "employee" ("id") ON DELETE CASCADE;
                END IF;
                ALTER TABLE "evaluationtemplate" DROP CONSTRAINT IF EXISTS "evaluationtemplate_department_id_836fb523_fk_department_id";
                ALTER TABLE "evaluationtemplate" DROP COLUMN IF EXISTS "department_id";
            END IF;
            -- Case 2: previous user_id column exists (needs employee_id instead)
            IF EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'evaluationtemplate' AND column_name = 'user_id'
            ) THEN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'evaluationtemplate' AND column_name = 'employee_id'
                ) THEN
                    ALTER TABLE "evaluationtemplate" ADD COLUMN "employee_id" INT REFERENCES "employee" ("id") ON DELETE CASCADE;
                END IF;
                ALTER TABLE "evaluationtemplate" DROP CONSTRAINT IF EXISTS "evaluationtemplate_user_id_80c6dfc6_fk_user_id";
                ALTER TABLE "evaluationtemplate" DROP COLUMN IF EXISTS "user_id";
            END IF;
            -- Case 3: table exists but has no FK column at all
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_name = 'evaluationtemplate' AND column_name = 'employee_id'
            ) THEN
                ALTER TABLE "evaluationtemplate" ADD COLUMN "employee_id" INT NOT NULL REFERENCES "employee" ("id") ON DELETE CASCADE;
            END IF;
        END $$;
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("evaluation_template table OK")
except Exception as e:
    print(f"evaluation_template check skipped: {e}")

print("Ensuring commissionconfig table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "commissionconfig" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "product_name" VARCHAR(255) NOT NULL,
            "rate" DECIMAL(15,2) NOT NULL,
            "objectif" INT NOT NULL DEFAULT 0,
            "group_name" VARCHAR(100) NOT NULL DEFAULT '',
            "active" BOOLEAN NOT NULL DEFAULT TRUE,
            "is_gpv" BOOLEAN NOT NULL DEFAULT FALSE,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("product_name", "is_gpv")
        );
    """)
    # Tables existantes : ajouter la colonne is_gpv si absente
    cur.execute("""
        ALTER TABLE "commissionconfig" ADD COLUMN IF NOT EXISTS "is_gpv" BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # Remplacer l'ancienne contrainte UNIQUE sur product_name seul par (product_name, is_gpv)
    cur.execute("""
        ALTER TABLE "commissionconfig" DROP CONSTRAINT IF EXISTS "commissionconfig_product_name_key";
        ALTER TABLE "commissionconfig" DROP CONSTRAINT IF EXISTS "commissionconfig_product_name_is_gpv_key";
        ALTER TABLE "commissionconfig" ADD CONSTRAINT "commissionconfig_product_name_is_gpv_key" UNIQUE ("product_name", "is_gpv");
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("commissionconfig table OK (is_gpv ajouté)")
except Exception as e:
    print(f"commissionconfig check skipped: {e}")

print("Starting application...")
