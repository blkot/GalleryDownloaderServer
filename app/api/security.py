from fastapi import Depends, HTTPException, Request, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from starlette import status

from app.config import settings

bearer_scheme = HTTPBearer(auto_error=False)


async def require_token(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> str:
    """Validate that the caller provides the configured bearer token."""
    token = None
    if credentials is not None:
        token = credentials.credentials
    if token is None:
        token = request.query_params.get("token")
    if token != settings.api_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing token")
    return token
