from fastapi import HTTPException

from app.config import settings


def require_admin():
    if settings.public_read_only:
        raise HTTPException(
            403,
            "This endpoint is disabled in public read-only mode.",
        )
