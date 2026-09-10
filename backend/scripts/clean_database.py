"""
Script pour supprimer toutes les données de la base (structure conservée).
Usage : python -m scripts.clean_database
"""
import sys
sys.path.append('.')

import os
import psycopg2
from app.db_config import DATABASE_URL
from urllib.parse import urlparse

url = urlparse(DATABASE_URL)

# Tables dans l'ordre des dépendances FK (enfants d'abord)
TABLES = [
    "notification",
    "auditlog",
    "validation",
    "bonus",
    "evaluationtemplate",
    "user_servicegroup",
    "user_service_assignment",
    "employee",
    "primemax",
    "commissionconfig",
    "servicegroup",
    "user",
    "department",
    "currency",
    "systemconfig",
]

SEQUENCES = [
    "user_id_seq",
    "department_id_seq",
    "employee_id_seq",
    "bonus_id_seq",
    "validation_id_seq",
    "auditlog_id_seq",
    "evaluationtemplate_id_seq",
    "notification_id_seq",
    "servicegroup_id_seq",
    "user_service_assignment_id_seq",
    "primemax_id_seq",
    "commissionconfig_id_seq",
]


def main():
    conn = psycopg2.connect(
        host=url.hostname,
        port=url.port,
        dbname=url.path.lstrip("/"),
        user=url.username,
        password=url.password,
    )
    conn.autocommit = True
    cur = conn.cursor()

    print("Suppression de toutes les données...")

    # Désactiver temporairement les contraintes FK pour le TRUNCATE
    cur.execute("SET session_replication_role = 'replica';")

    total = 0
    for table in TABLES:
        try:
            # "user" est un mot réservé PostgreSQL → guillemets doubles
            tbl = f'"{table}"' if table == "user" else table
            cur.execute(f"TRUNCATE TABLE {tbl} RESTART IDENTITY CASCADE;")
            print(f"  ✓ {table}")
            total += 1
        except Exception as e:
            print(f"  ✗ {table}: {e}")

    # Réactiver les contraintes FK
    cur.execute("SET session_replication_role = 'origin';")

    # Réinitialiser les séquences à 1
    print("\nRéinitialisation des séquences...")
    for seq in SEQUENCES:
        try:
            cur.execute(f"ALTER SEQUENCE {seq} RESTART WITH 1;")
            print(f"  ✓ {seq}")
        except Exception as e:
            print(f"  ✗ {seq}: {e}")

    cur.close()
    conn.close()

    print(f"\nTerminé : {total} table(s) vidée(s), schéma conservé.")


if __name__ == "__main__":
    main()
