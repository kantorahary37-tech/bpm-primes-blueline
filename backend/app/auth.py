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
