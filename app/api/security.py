from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette import status

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


async def require_token(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> str:
    """Validate that the caller provides the configured bearer token."""
    if credentials is None or credentials.credentials != settings.api_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing token")
    return credentials.credentials

