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
    print(f"evaluation_template table check skipped: {e}")

print("Ensuring systemconfig table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "systemconfig" (
            "key" VARCHAR(100) NOT NULL PRIMARY KEY,
            "value" TEXT NOT NULL DEFAULT '',
            "category" VARCHAR(50) NOT NULL,
            "description" VARCHAR(255) NOT NULL DEFAULT ''
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("systemconfig table OK")
except Exception as e:
    print(f"systemconfig table check skipped: {e}")

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

print("Ensuring commissiongcconfig table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "commissiongcconfig" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "mrc_objective" DECIMAL(15,2) NOT NULL,
            "fms_objective" DECIMAL(15,2) NOT NULL,
            "commission_at_100" DECIMAL(15,2) NOT NULL,
            "max_commission" DECIMAL(15,2) NOT NULL DEFAULT 1000000,
            "active" BOOLEAN NOT NULL DEFAULT TRUE,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE "commissiongcconfig" DROP COLUMN IF EXISTS "period";
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("commissiongcconfig table OK")
except Exception as e:
    print(f"commissiongcconfig check skipped: {e}")

print("Ensuring employee currency column exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'Ar';
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("employee currency column OK")
except Exception as e:
    print(f"employee currency column check skipped: {e}")

print("Ensuring employee poste column exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "poste" VARCHAR(255);
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("employee poste column OK")
except Exception as e:
    print(f"employee poste column check skipped: {e}")

print("Ensuring primemax currency column exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE "primemax" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'Ar';
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("primemax currency column OK")
except Exception as e:
    print(f"primemax currency column check skipped: {e}")

print("Ensuring currency table exists and seeded...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "currency" (
            "code" VARCHAR(10) NOT NULL PRIMARY KEY,
            "symbol" VARCHAR(10) NOT NULL DEFAULT '',
            "label" VARCHAR(50) NOT NULL DEFAULT '',
            "is_system" BOOLEAN NOT NULL DEFAULT FALSE,
            "active" BOOLEAN NOT NULL DEFAULT TRUE
        );
    """)
    cur.execute("""
        INSERT INTO "currency" ("code", "symbol", "label", "is_system", "active") VALUES
        ('Ar', 'Ar', 'Ariary', TRUE, TRUE),
        ('EUR', '€', 'Euro', TRUE, TRUE)
        ON CONFLICT ("code") DO NOTHING;
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("currency table OK (Ar/EUR seeded)")
except Exception as e:
    print(f"currency table check skipped: {e}")

print("Ensuring servicegroup table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "servicegroup" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "name" VARCHAR(100) NOT NULL,
            "department_id" INT NOT NULL REFERENCES "department" ("id"),
            "created_by_id" INT REFERENCES "user" ("id"),
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    # Un même nom de service ne peut exister qu'une fois par département
    cur.execute("""
        ALTER TABLE "servicegroup" DROP CONSTRAINT IF EXISTS "servicegroup_name_department_id_key";
        ALTER TABLE "servicegroup" ADD CONSTRAINT "servicegroup_name_department_id_key" UNIQUE ("name", "department_id");
    """)
    # Colonne de rattachement des employés au service
    cur.execute("""
        ALTER TABLE "employee" ADD COLUMN IF NOT EXISTS "service_group_id" INT REFERENCES "servicegroup" ("id");
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("servicegroup table OK")
except Exception as e:
    print(f"servicegroup table check skipped: {e}")

print("Ensuring user_servicegroup table exists (N+1 → services)...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "user_servicegroup" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
            "servicegroup_id" INT NOT NULL REFERENCES "servicegroup" ("id") ON DELETE CASCADE,
            UNIQUE ("user_id", "servicegroup_id")
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("user_servicegroup table OK")
except Exception as e:
    print(f"user_servicegroup table check skipped: {e}")

print("Ensuring user_service_assignment table exists (service + n+1 utilisateur)...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "user_service_assignment" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "user_id" INT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
            "service_group_id" INT NOT NULL REFERENCES "servicegroup" ("id") ON DELETE CASCADE,
            "n1_id" INT REFERENCES "user" ("id"),
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("user_id", "service_group_id")
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("user_service_assignment table OK")
except Exception as e:
    print(f"user_service_assignment table check skipped: {e}")

print("Ensuring configsnapshot table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "configsnapshot" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "label" VARCHAR(255) NOT NULL,
            "created_by_id" INT NOT NULL REFERENCES "user" ("id"),
            "snapshot_data" JSONB NOT NULL,
            "employee_count" INT NOT NULL DEFAULT 0,
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("configsnapshot table OK")
except Exception as e:
    print(f"configsnapshot table check skipped: {e}")

print("Ensuring bonus currency column exists (with backfill)...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        ALTER TABLE bonus ADD COLUMN IF NOT EXISTS "currency" VARCHAR(10) NOT NULL DEFAULT 'Ar';
        CREATE INDEX IF NOT EXISTS bonus_currency_idx ON bonus (currency);
        -- Backfill : chaque prime existante reprend la devise de son employé
        UPDATE bonus b SET currency = e.currency
        FROM employee e WHERE b.employee_id = e.id AND b.currency = 'Ar' AND e.currency <> 'Ar';
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("bonus currency column OK (backfill employee)")
except Exception as e:
    print(f"bonus currency column check skipped: {e}")

print("Ensuring N+2 role columns exist...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    # user.is_validator_n2
    cur.execute("""
        ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_validator_n2" BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # bonus.pass_to_n2
    cur.execute("""
        ALTER TABLE bonus ADD COLUMN IF NOT EXISTS "pass_to_n2" BOOLEAN NOT NULL DEFAULT FALSE;
    """)
    # bonus.n2_user_id FK
    cur.execute("""
        ALTER TABLE bonus ADD COLUMN IF NOT EXISTS "n2_user_id" INT REFERENCES "user" ("id") ON DELETE SET NULL;
    """)
    # bonus.bonus_type: les 8 types (le plus long est "commission_entreprise", 21 car.)
    cur.execute("""
        ALTER TABLE bonus ALTER COLUMN "bonus_type" TYPE VARCHAR(30);
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("N+2 role columns OK")
except Exception as e:
    print(f"N+2 role columns check skipped: {e}")

print("Ensuring primereminderexecution table exists...")
try:
    import psycopg2
    conn = psycopg2.connect(os.getenv("DATABASE_URL", "postgres://postgres:mysecretpassword@db:5432/bpm_primes_db"))
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS "primereminderexecution" (
            "id" SERIAL NOT NULL PRIMARY KEY,
            "notification_type" VARCHAR(50) NOT NULL,
            "trigger_type" VARCHAR(20) NOT NULL,
            "scheduled_for" TIMESTAMPTZ,
            "recipient" VARCHAR(1000) NOT NULL DEFAULT '',
            "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
            "summary" JSONB,
            "total_count" INT NOT NULL DEFAULT 0,
            "sent_at" TIMESTAMPTZ,
            "error_message" TEXT,
            "created_by_id" INT REFERENCES "user" ("id"),
            "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE ("notification_type", "scheduled_for")
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("primereminderexecution table OK")
except Exception as e:
    print(f"primereminderexecution table check skipped: {e}")

print("Starting application...")
