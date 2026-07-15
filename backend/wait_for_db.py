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

print("Starting application...")
