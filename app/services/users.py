from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User, UserRole
from ..schemas.auth import RegisterRequest
from ..schemas.user import UserUpdate, UserRoleUpdate
from ..schemas.response import PaginationMeta
from ..repositories.users import (get_user_by_id, get_user_by_email, get_users,
                                  create_user, update_user)
from ..auth.security import hash_password, verify_password, create_access_token


def register_user_service(db: Session, data: RegisterRequest):
    if get_user_by_email(db, data.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    try:
        user = create_user(db, {
            "full_name": data.full_name,
            "email": data.email.lower(),
            "password_hash": hash_password(data.password),
            "role": UserRole.CUSTOMER,  # role is never taken from the client
        })
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    return user


def login_user_service(db: Session, email: str, password: str):
    user = get_user_by_email(db, email)

    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive user")
    return {"access_token": create_access_token(user.id)}


def update_me_service(db: Session, user: User, data: UserUpdate):
    values = data.model_dump(exclude_unset=True, exclude_none=True)

    if "email" in values:
        values["email"] = values["email"].lower()
        existing = get_user_by_email(db, values["email"])
        if existing and existing.id != user.id:
            raise HTTPException(status_code=409, detail="Email already registered")
    if "password" in values:
        values["password_hash"] = hash_password(values.pop("password"))

    try:
        return update_user(db, user, values)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")


def get_users_service(db: Session, search, role, is_active, page: int, page_size: int):
    users, total = get_users(db, search, role, is_active, page, page_size)
    return users, PaginationMeta.create(total, page, page_size)


def change_role_service(db: Session, admin: User, user_id: int, data: UserRoleUpdate):
    user = get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    return update_user(db, user, {"role": data.role})


def create_first_admin_service(db: Session):
    # Bootstraps an admin from .env so the role endpoints are usable on a fresh database
    if not settings.FIRST_ADMIN_EMAIL or not settings.FIRST_ADMIN_PASSWORD:
        return
    if get_user_by_email(db, settings.FIRST_ADMIN_EMAIL):
        return
    create_user(db, {
        "full_name": "Administrator",
        "email": settings.FIRST_ADMIN_EMAIL.lower(),
        "password_hash": hash_password(settings.FIRST_ADMIN_PASSWORD),
        "role": UserRole.ADMIN,
    })
