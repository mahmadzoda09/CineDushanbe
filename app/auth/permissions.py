from typing import Annotated

from fastapi import Depends, HTTPException, status

from ..models.user import User, UserRole
from .dependencies import CurrentUser


def require_roles(*roles: str):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions",
            )
        return user
    return checker


AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
StaffUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CINEMA_MANAGER))]


def is_staff(user: User) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.CINEMA_MANAGER)
