import socket
import time
import os
import subprocess

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

# Run pending aerich migrations
print("Running migrations...")
result = subprocess.run(["aerich", "upgrade"], capture_output=True, text=True)
if result.returncode != 0:
    # Table "aerich" does not exist yet — first-time init
    print("aerich not initialized, running init-db...")
    subprocess.run(["aerich", "init-db"])

print("Starting application...")
