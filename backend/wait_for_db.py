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
            "department_id" INT NOT NULL REFERENCES "department" ("id") ON DELETE CASCADE
        );
    """)
    conn.commit()
    cur.close()
    conn.close()
    print("evaluation_template table OK")
except Exception as e:
    print(f"evaluation_template check skipped: {e}")

print("Starting application...")
