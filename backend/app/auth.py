from datetime import datetime, timedelta
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.models import User
from tortoise.exceptions import DoesNotExist
from app.config import get_config

# Schéma pour le token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Fonctions utilitaires
def verify_password(plain_password, hashed_password):
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def get_password_hash(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def local_admin_emails() -> set[str]:
    """Comptes administrateurs habilités à se connecter en local (config
    ``LDAP_LOCAL_ADMIN_EMAILS``, séparés par virgules)."""
    raw = get_config("LDAP_LOCAL_ADMIN_EMAILS") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def can_use_local_password(user) -> bool:
    """True si ce compte peut être authentifié par son mot de passe local
    (bcrypt) même lorsque l'authentification LDAP est activée.

    Port de secours de l'administration : sans lui, une panne, une mauvaise
    configuration ou la perte d'accès à l'annuaire rendrait BPM
    inutilisable, puisque le mot de passe LDAP ne peut pas être changé depuis
    l'application.

    Par sécurité :
      - seuls les comptes ``is_admin`` en bénéficient (un compte rétrogradé
        perd automatiquement le contournement) ;
      - la comparaison porte sur l'adresse email, quelle que soit sa casse ;
      - le contournement est piloté par le menu Configuration, pas codé en dur.
    """
    if not user or not user.is_admin:
        return False
    return (user.email or "").strip().lower() in local_admin_emails()

def _secret_key() -> str:
    """Retourne la clé secrète JWT, avec fallback dev si non configurée.

    Un avertissement est affiché pour inciter à définir SECRET_KEY en prod.
    """
    secret = get_config("SECRET_KEY")
    if not secret:
        import os
        import warnings
        warnings.warn("SECRET_KEY non configurée : utilisation de la clé de développement par défaut. Définissez SECRET_KEY en production !")
        secret = os.environ.get("SECRET_KEY") or "dev-insecure-secret-key-change-me"
    return secret

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=int(get_config("ACCESS_TOKEN_EXPIRE_MINUTES") or "1440"))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, _secret_key(), algorithm=get_config("ALGORITHM") or "HS256")

# Récupération de l'utilisateur courant
async def get_current_user(token: str = Depends(oauth2_scheme)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, _secret_key(), algorithms=[get_config("ALGORITHM") or "HS256"])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    try:
        user = await User.get(id=int(user_id))
    except DoesNotExist:
        raise credentials_exception
    
    return user

# Récupération de l'utilisateur courant (optionnel, pour certaines routes)
async def get_current_user_optional(token: str = Depends(oauth2_scheme)):
    try:
        return await get_current_user(token)
    except:
        return None
