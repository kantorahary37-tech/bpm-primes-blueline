"""Formatage des montants avec la devise de l'employé.

Les emails (notifications de validation, rappels quotidiens, rappels de date
limite) affichent le montant de chaque prime : il doit rester dans la devise
de l'employé — « 1 234 567 Ar » pour un employé payé en Ariary,
« 1 234 € » pour un employé payé en euro — et jamais être converti ni
uniformisé en Ar.
"""
from app.models import Currency


def employee_currency_code(emp) -> str:
    """Code de devise d'un employé (compat CharEnumField -> CharField)."""
    return emp.currency.value if hasattr(emp.currency, 'value') else (emp.currency or 'Ar')


async def currency_symbol(code: str) -> str:
    """Symbole d'affichage d'une devise (retourne le code si non défini)."""
    cur = await Currency.get_or_none(code=code)
    return cur.symbol if cur and cur.symbol else code


async def format_amount_with_currency(amount, emp) -> str:
    """Montant formaté « 1 234 567 Ar » / « 1 234 € » selon la devise de l'employé."""
    symbol = await currency_symbol(employee_currency_code(emp))
    return f"{int(amount):,}".replace(",", " ") + f" {symbol}"
