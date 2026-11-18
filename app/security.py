from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from app.config import settings


def hash_password(plain_password: str) -> str:
    hashed = bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except ValueError:
        # Over-long password (bcrypt>=5 raises) or a malformed stored hash:
        # treat as a failed login instead of a 500.
        return False


def create_access_token(user_id: int, role: str) -> str:
    """The subject is the immutable user id, not the email, so an email
    change can never make an old token point at someone else."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,  # informational only - the server re-reads the role from the DB
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
