# Explorateur SFTP : récupération du fichier CSV 4D des ventes
# - Connexion au serveur 4D via SFTP (paramètres configurables par variables d'environnement)
# - Liste des dossiers/fichiers (modal type FileZilla côté frontend)
# - Téléchargement du fichier sélectionné (renvoyé en base64, réutilisé par le flux de calcul existant)
#
# Performances :
# - Connexions SFTP persistantes (pool) : évite la réouverture d'une session SSH complète
#   (handshake + authentification) à chaque requête, qui était le principal goulot d'étranglement.
# - Cache local sur le serveur : un fichier déjà téléchargé est réutilisé tant qu'il n'a pas
#   changé côté distant (comparaison taille + date de modification) et dans la limite du TTL.
# - Cache de courte durée pour les listes de dossiers (navigation rapide dans le modal).
import base64
import hashlib
import json
import os
import stat
import threading
import time
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.models import User
from app.config import get_config

try:
    import paramiko
except ImportError:  # pragma: no cover
    paramiko = None

router = APIRouter(dependencies=[Depends(get_current_user)])

# ---------------------------------------------------------------------------
# Pool de connexions SFTP persistantes
# ---------------------------------------------------------------------------
# Une connexion paramiko n'est pas thread-safe : chaque requête acquiert une
# session du pool, l'utilise de façon exclusive, puis la rend (ou la ferme si
# elle est devenue invalide). Le nombre de sessions conservées est borné par
# SFTP_POOL_SIZE.
_POOL_LOCK = threading.Lock()
_POOL: list[dict] = []

_LIST_CACHE: dict[str, tuple[float, list]] = {}


def _can_manage_commission(user: User) -> bool:
    return bool(user.is_admin or user.is_dg or user.is_drh or user.is_validator_n1 or user.is_directeur)


def _config_int(key: str, default: int) -> int:
    try:
        return int(get_config(key) or str(default))
    except (TypeError, ValueError):
        return default


def _open_sftp():
    """Ouvre une connexion SFTP (client SSH + session SFTP)."""
    if paramiko is None:
        raise HTTPException(500, "Le module paramiko n'est pas installé sur le serveur.")
    host = get_config("SFTP_HOST")
    port = int(get_config("SFTP_PORT") or "22")
    username = get_config("SFTP_USERNAME")
    password = get_config("SFTP_PASSWORD")
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        client.connect(
            hostname=host,
            port=port,
            username=username,
            password=password,
            timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
    except Exception as exc:
        try:
            client.close()
        except Exception:
            pass
        raise HTTPException(502, f"Connexion SFTP impossible ({username}@{host}:{port}) : {exc}")
    try:
        return client, client.open_sftp()
    except Exception as exc:
        client.close()
        raise HTTPException(502, f"Ouverture de la session SFTP impossible : {exc}")


def _alive(entry) -> bool:
    """True si la connexion SSH/SFTP est toujours active."""
    try:
        transport = entry["client"].get_transport()
        return transport is not None and transport.is_active()
    except Exception:
        return False


def _destroy_entry(entry) -> None:
    try:
        entry["sftp"].close()
    except Exception:
        pass
    try:
        entry["client"].close()
    except Exception:
        pass


def _acquire_sftp() -> dict:
    """Rend une session SFTP disponible, reconnecte si nécessaire."""
    with _POOL_LOCK:
        now = time.time()
        ttl = _config_int("SFTP_CONNECTION_TTL", 900)
        for i in range(len(_POOL) - 1, -1, -1):
            e = _POOL[i]
            if not _alive(e) or now - e["created"] >= ttl:
                _destroy_entry(_POOL.pop(i))
        if _POOL:
            return _POOL.pop()
    client, sftp = _open_sftp()
    return {"client": client, "sftp": sftp, "created": time.time()}


def _release_sftp(entry: dict, keep: bool) -> None:
    """Rend la session au pool (si le pool n'est pas plein) ou la ferme."""
    with _POOL_LOCK:
        pool_size = max(1, _config_int("SFTP_POOL_SIZE", 2))
        if keep and len(_POOL) < pool_size:
            _POOL.append(entry)
        else:
            _destroy_entry(entry)


def _run_sftp(desc: str, fn):
    """
    Exécute fn(client, sftp) sur une session du pool.
    En cas d'erreur réseau/SSH la connexion est fermée (pas de réutilisation
    d'une session corrompue) ; les erreurs métier (404, 413…) conservent la session.
    """
    entry = _acquire_sftp()
    keep = True
    try:
        return fn(entry["client"], entry["sftp"])
    except FileNotFoundError:
        raise
    except HTTPException:
        raise
    except (paramiko.SSHException, OSError, EOFError) as exc:
        keep = False
        raise HTTPException(502, f"Erreur {desc} : {exc}")
    except Exception as exc:
        keep = False
        raise HTTPException(502, f"Erreur {desc} : {exc}")
    finally:
        _release_sftp(entry, keep)


# ---------------------------------------------------------------------------
# Cache local des fichiers SFTP
# ---------------------------------------------------------------------------
def _cache_dir():
    cfg = (get_config("SFTP_CACHE_DIR") or "").strip()
    if cfg and os.path.isabs(cfg):
        directory = cfg
    else:
        directory = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sftp_cache"
        )
    try:
        os.makedirs(directory, exist_ok=True)
        return directory
    except OSError:
        return None


def _cache_key(path: str) -> str:
    return hashlib.sha1(path.encode("utf-8")).hexdigest()


def _cache_paths(path: str):
    key = _cache_key(path)
    directory = _cache_dir()
    if not directory:
        return None, None
    return (
        os.path.join(directory, f"{key}.data"),
        os.path.join(directory, f"{key}.json"),
    )


def _download_with_cache(sftp, path: str, remote):
    """
    Retourne (contenu, statut) où statut est 'miss' (téléchargé) ou 'hit' (cache).
    Le cache n'est réutilisé que si TTL valide ET taille/date identiques au distant.
    """
    cache_enabled = (get_config("SFTP_CACHE_ENABLED") or "true").lower() == "true"
    ttl = _config_int("SFTP_CACHE_TTL", 3600)
    data_path, meta_path = _cache_paths(path)

    remote_size = int(remote.st_size or 0)
    remote_mtime = float(remote.st_mtime or 0)

    if cache_enabled and data_path and meta_path:
        try:
            if os.path.exists(data_path) and os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                if (
                    meta.get("size") == remote_size
                    and abs(float(meta.get("mtime") or 0) - remote_mtime) < 0.001
                    and time.time() - float(meta.get("cached_at") or 0) < ttl
                ):
                    with open(data_path, "rb") as f:
                        return f.read(), "hit"
        except Exception:
            pass

    with sftp.open(path, "rb") as f:
        data = f.read()

    if cache_enabled and data_path and meta_path:
        try:
            tmp_data = data_path + ".tmp"
            tmp_meta = meta_path + ".tmp"
            with open(tmp_data, "wb") as f:
                f.write(data)
            with open(tmp_meta, "w", encoding="utf-8") as f:
                json.dump({
                    "path": path,
                    "size": remote_size,
                    "mtime": remote_mtime,
                    "cached_at": time.time(),
                }, f)
            os.replace(tmp_data, data_path)
            os.replace(tmp_meta, meta_path)
        except Exception:
            pass

    return data, "miss"


def _fetch_listing(sftp, path: str) -> list:
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
    return entries


def _list_cached(sftp, path: str) -> tuple:
    """
    Retourne (entries, depuis_cache). Les listes sont mises en cache une
    courte durée pour une navigation fluide dans le modal.
    """
    ttl = _config_int("SFTP_LIST_CACHE_TTL", 30)
    if ttl > 0:
        hit = _LIST_CACHE.get(path)
        if hit and time.time() - hit[0] < ttl:
            return hit[1], True

    entries = _fetch_listing(sftp, path)
    if ttl > 0:
        _LIST_CACHE[path] = (time.time(), entries)
    return entries, False


class SftpListRequest(BaseModel):
    path: str = "."


class SftpDownloadRequest(BaseModel):
    path: str


@router.get("/sftp/info")
async def sftp_info(user: User = Depends(get_current_user)):
    """Informations de connexion affichées dans le modal (le mot de passe ne sort jamais du backend)."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")
    return {"host": get_config("SFTP_HOST"), "port": int(get_config("SFTP_PORT") or "22"), "username": get_config("SFTP_USERNAME")}


@router.post("/sftp/list")
async def sftp_list(req: SftpListRequest, user: User = Depends(get_current_user)):
    """Liste le contenu d'un dossier distant (cache de courte durée pour la navigation)."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")

    path = req.path or "."

    def _do(client, sftp):
        try:
            normalized = sftp.normalize(path)
        except Exception:
            normalized = path
        entries, _from_cache = _list_cached(sftp, path)
        return {"path": normalized, "entries": entries}

    try:
        return _run_sftp(f"lecture du dossier {path}", _do)
    except FileNotFoundError:
        raise HTTPException(404, f"Dossier introuvable sur le serveur : {req.path}")


@router.post("/sftp/download")
async def sftp_download(req: SftpDownloadRequest, user: User = Depends(get_current_user)):
    """Télécharge un fichier distant et le renvoie en base64 (le front le transforme en File)."""
    if not _can_manage_commission(user):
        raise HTTPException(403, "Vous n'avez pas le droit de consulter le serveur de ventes.")

    max_download = int(get_config("SFTP_MAX_DOWNLOAD") or str(50 * 1024 * 1024))

    def _do(client, sftp):
        remote = sftp.stat(req.path)
        size = int(remote.st_size or 0)
        if size > max_download:
            raise HTTPException(413, f"Fichier trop volumineux ({size} octets, max {max_download}).")
        data, status = _download_with_cache(sftp, req.path, remote)
        name = os.path.basename(req.path.rstrip("/")) or "fichier.csv"
        return {
            "path": req.path,
            "name": name,
            "size": len(data),
            "cache": status,
            "content_base64": base64.b64encode(data).decode("ascii"),
        }

    try:
        return _run_sftp(f"téléchargement du fichier {req.path}", _do)
    except FileNotFoundError:
        raise HTTPException(404, "Fichier introuvable sur le serveur.")