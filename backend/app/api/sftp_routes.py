# Explorateur SFTP : récupération du fichier CSV 4D des ventes
# - Connexion au serveur 4D via SFTP (paramètres configurables par variables d'environnement)
# - Liste des dossiers/fichiers (modal type FileZilla côté frontend)
# - Téléchargement du fichier sélectionné (renvoyé en base64, réutilisé par le flux de calcul existant)
import base64
import os
import stat
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User

try:
    import paramiko
except ImportError:  # pragma: no cover
    paramiko = None

router = APIRouter(dependencies=[Depends(get_current_user)])

# Paramètres SFTP (surchargeables via variables d'environnement)
SFTP_HOST = os.getenv("SFTP_HOST", "192.168.1.104")
SFTP_PORT = int(os.getenv("SFTP_PORT", "22"))
SFTP_USERNAME = os.getenv("SFTP_USERNAME", "4dprime")
SFTP_PASSWORD = os.getenv("SFTP_PASSWORD", "prime12345")
# Taille maximale d'un fichier téléchargeable (50 Mo par défaut)
SFTP_MAX_DOWNLOAD = int(os.getenv("SFTP_MAX_DOWNLOAD", str(50 * 1024 * 1024)))


def _can_manage_commission(user: User) -> bool:
    return bool(user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur)


def _sftp():
    """Ouvre une connexion SFTP (connexion courte, refermée à chaque requête)."""
    if paramiko is None:
        raise HTTPException(500, "Le module paramiko n'est pas installé sur le serveur.")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=SFTP_HOST,
            port=SFTP_PORT,
            username=SFTP_USERNAME,
            password=SFTP_PASSWORD,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
    except Exception as exc:
        try:
            client.close()
        except Exception:
            pass
        raise HTTPException(502, f"Connexion SFTP impossible ({SFTP_USERNAME}@{SFTP_HOST}:{SFTP_PORT}) : {exc}")
    try:
        return client, client.open_sftp()
    except Exception as exc:
        client.close()
        raise HTTPException(502, f"Ouverture de la session SFTP impossible : {exc}")


class SftpListRequest(BaseModel):
    path: str = "."


class SftpDownloadRequest(BaseModel):
    path: str


@router.get("/sftp/info")
async def sftp_info(user: User = Depends(get_current_user)):
    """Informations de connexion affichées dans le modal (le mot de passe ne sort jamais du backend)."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")
    return {"host": SFTP_HOST, "port": SFTP_PORT, "username": SFTP_USERNAME}


@router.post("/sftp/list")
async def sftp_list(req: SftpListRequest, user: User = Depends(get_current_user)):
    """Liste le contenu d'un dossier distant."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")

    client, sftp = _sftp()
    try:
        path = req.path or "."
        entries = []
        for attr in sftp.listdir_attr(path):
            is_dir = stat.S_ISDIR(attr.st_mode)
            entries.append({
                "name": attr.filename,
                "type": "dir" if is_dir else "file",
                "size": int(attr.st_size or 0),
                "mtime": datetime.fromtimestamp(attr.st_mtime).isoformat() if attr.st_mtime else None,
            })
        entries.sort(key=lambda e: (e["type"] != "dir", e["name"].lower()))
        return {"path": sftp.normalize(path), "entries": entries}
    except FileNotFoundError:
        raise HTTPException(404, f"Dossier introuvable sur le serveur : {req.path}")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Erreur de lecture du dossier : {exc}")
    finally:
        try:
            sftp.close()
        finally:
            client.close()


@router.post("/sftp/download")
async def sftp_download(req: SftpDownloadRequest, user: User = Depends(get_current_user)):
    """Télécharge un fichier distant et le renvoie en base64 (le front le transforme en File)."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")

    client, sftp = _sftp()
    try:
        size = int(sftp.stat(req.path).st_size or 0)
        if size > SFTP_MAX_DOWNLOAD:
            raise HTTPException(413, f"Fichier trop volumineux ({size} octets, max {SFTP_MAX_DOWNLOAD}).")
        with sftp.open(req.path, "rb") as f:
            data = f.read()
        name = os.path.basename(req.path.rstrip("/")) or "fichier.csv"
        return {
            "path": req.path,
            "name": name,
            "size": len(data),
            "content_base64": base64.b64encode(data).decode("ascii"),
        }
    except FileNotFoundError:
        raise HTTPException(404, "Fichier introuvable sur le serveur.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"Erreur de téléchargement du fichier : {exc}")
    finally:
        try:
            sftp.close()
        finally:
            client.close()
