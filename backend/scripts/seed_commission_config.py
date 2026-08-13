"""
Script pour créer le barème des commissions par défaut (table commissionconfig).
Usage : python -m scripts.seed_commission_config
"""
import sys
sys.path.append('.')

from app.db_config import TORTOISE_ORM
from tortoise import Tortoise, run_async
from app.models import CommissionConfig

# Barème d'exemple (Groupe, Produit, Taux Ar/vente, Objectif)
BAREME = [
    ('Unlimited', 'Unlimited 20', 25000, 4),
    ('Unlimited', 'Unlimited 30', 40000, 4),
    ('Unlimited', 'Unlimited 50', 50000, 4),
    ('Basculement', 'Basculement vers Unlimited 30', 15000, 3),
    ('Basculement', 'Basculement vers Unlimited 50', 20000, 3),
    ('4G Postpayé', '4G 1To', 30000, 7),
    ('4G Postpayé', '4G 500 Go', 25000, 7),
    ('4G Postpayé', '4G 200 Go / 85 Go', 20000, 7),
    ('4G Postpayé', 'Autres 4G postpayé', 15000, 7),
    ('4G Prépayé', '4G Prépayé Litebox', 10000, 6),
    ('4G Prépayé', '4G Prépayé T30', 10000, 6),
    ('4G Puce', '4G Puce', 1000, 60),
    ('IZY + BOX', 'IZY Postpaid', 10000, 2),
    ('IZY + BOX', 'BOX TV', 10000, 2),
]


async def seed():
    await Tortoise.init(config=TORTOISE_ORM)

    created = 0
    updated = 0
    for group, product, rate, objectif in BAREME:
        existing = await CommissionConfig.filter(product_name=product).first()
        if existing:
            existing.rate = rate
            existing.objectif = objectif
            existing.group_name = group
            existing.active = True
            await existing.save()
            print(f"  ~ {product} : mis à jour ({rate} Ar/vente, objectif {objectif})")
            updated += 1
        else:
            await CommissionConfig.create(
                product_name=product,
                rate=rate,
                objectif=objectif,
                group_name=group,
                active=True,
            )
            print(f"  ✓ {product} : créé ({rate} Ar/vente, objectif {objectif})")
            created += 1

    await Tortoise.close_connections()
    print(f"\n✅ {created} produit(s) créé(s), {updated} mis à jour.")


if __name__ == "__main__":
    run_async(seed())
