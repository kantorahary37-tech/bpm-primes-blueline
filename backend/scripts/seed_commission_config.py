"""
Script pour créer le barème des commissions par défaut (table commissionconfig).
Usage : python -m scripts.seed_commission_config

Chaque produit existe en deux lignes :
  - is_gpv=False → objectif pour les petits points de vente (PDV)
  - is_gpv=True  → objectif pour les grands points de vente (GPV)
Les taux (Ar/vente) sont identiques, seuls les objectifs changent.
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import CommissionConfig

# Barème petit point de vente (is_gpv=False)
# (Groupe, Produit, Taux Ar/vente, Objectif, is_gpv)
BAREME = [
    # ----- Petit point de vente (is_gpv=False) -----
    ('Unlimited', 'Unlimited 20', 25000, 4, False),
    ('Unlimited', 'Unlimited 30', 40000, 4, False),
    ('Unlimited', 'Unlimited 50', 50000, 4, False),
    ('Basculement', 'Basculement vers Unlimited 30', 15000, 3, False),
    ('Basculement', 'Basculement vers Unlimited 50', 20000, 3, False),
    ('4G Postpayé', '4G 1To', 30000, 7, False),
    ('4G Postpayé', '4G 500 Go', 25000, 7, False),
    ('4G Postpayé', '4G 200 Go / 85 Go', 20000, 7, False),
    ('4G Postpayé', 'Autres 4G postpayé', 15000, 7, False),
    ('4G Prépayé', '4G Prépayé Litebox', 10000, 6, False),
    ('4G Prépayé', '4G Prépayé T30', 10000, 6, False),
    ('4G Puce', '4G Puce', 1000, 60, False),
    ('IZY + BOX', 'IZY Postpaid', 10000, 2, False),
    ('IZY + BOX', 'BOX TV', 10000, 2, False),

    # ----- Grand point de vente (is_gpv=True) -----
    ('Unlimited', 'Unlimited 20', 25000, 6, True),
    ('Unlimited', 'Unlimited 30', 40000, 6, True),
    ('Unlimited', 'Unlimited 50', 50000, 6, True),
    ('Basculement', 'Basculement vers Unlimited 30', 15000, 4, True),
    ('Basculement', 'Basculement vers Unlimited 50', 20000, 4, True),
    ('4G Postpayé', '4G 1To', 30000, 10, True),
    ('4G Postpayé', '4G 500 Go', 25000, 10, True),
    ('4G Postpayé', '4G 200 Go / 85 Go', 20000, 10, True),
    ('4G Postpayé', 'Autres 4G postpayé', 15000, 100, True),
    ('4G Prépayé', '4G Prépayé Litebox', 10000, 10, True),
    ('4G Prépayé', '4G Prépayé T30', 10000, 10, True),
    ('4G Puce', '4G Puce', 1000, 100, True),
    ('IZY + BOX', 'IZY Postpaid', 10000, 2, True),
    ('IZY + BOX', 'BOX TV', 10000, 2, True),
]


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    created = 0
    updated = 0
    for group, product, rate, objectif, is_gpv in BAREME:
        label = 'GPV' if is_gpv else 'petit PDV'
        existing = await CommissionConfig.filter(
            product_name=product, is_gpv=is_gpv
        ).first()
        if existing:
            existing.rate = rate
            existing.objectif = objectif
            existing.group_name = group
            existing.active = True
            await existing.save()
            print(f"  ~ {product} [{label}] : mis à jour ({rate} Ar/vente, objectif {objectif})")
            updated += 1
        else:
            await CommissionConfig.create(
                product_name=product,
                rate=rate,
                objectif=objectif,
                group_name=group,
                active=True,
                is_gpv=is_gpv,
            )
            print(f"  ✓ {product} [{label}] : créé ({rate} Ar/vente, objectif {objectif})")
            created += 1

    await Tortoise.close_connections()
    print(f"\n✅ {created} ligne(s) créée(s), {updated} mise(s) à jour.")


if __name__ == "__main__":
    run_async(seed())
