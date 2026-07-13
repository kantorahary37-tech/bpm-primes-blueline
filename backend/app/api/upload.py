import os, uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
from app.auth import get_current_user

router = APIRouter(dependencies=[Depends(get_current_user)])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".gif", ".doc", ".docx", ".xls", ".xlsx"}

# Magic bytes : premiers octets reels du fichier selon le type
MAGIC_BYTES = {
    ".pdf": [b"%PDF"],
    ".png": [b"\x89PNG"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".gif": [b"GIF87a", b"GIF89a"],
    ".doc": [b"\xd0\xcf\x11\xe0"],
    ".xls": [b"\xd0\xcf\x11\xe0"],
    ".docx": [b"PK\x03\x04"],
    ".xlsx": [b"PK\x03\x04"],
}

MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "Aucun fichier fourni")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Type de fichier non autorise. Formats acceptes : {', '.join(ALLOWED_EXTENSIONS)}")
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 10 Mo)")
    if not any(content.startswith(sig) for sig in MAGIC_BYTES.get(ext, [])):
        raise HTTPException(400, "Le contenu du fichier ne correspond pas a l'extension declaree")
    with open(filepath, "wb") as f:
        f.write(content)
    return JSONResponse(content={"filename": filename, "original_name": file.filename, "url": f"/api/v1/uploads/{filename}"})


@router.get("/uploads/{filename}")
async def download_file(filename: str, user=Depends(get_current_user)):
    filename = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, filename)
    abs_upload = os.path.abspath(UPLOAD_DIR)
    if not os.path.abspath(filepath).startswith(abs_upload):
        raise HTTPException(400, "Chemin de fichier invalide")
    if not os.path.isfile(filepath):
        raise HTTPException(404, "Fichier introuvable")
    ext = os.path.splitext(filename)[1].lower()
    media_type = MEDIA_TYPES.get(ext, "application/octet-stream")
    return FileResponse(filepath, media_type=media_type, filename=filename)
