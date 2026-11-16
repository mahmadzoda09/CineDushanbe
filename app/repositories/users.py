from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session

from ..models.user import User, UserRoleType


def get_user_by_id(db: Session, user_id: int):
    return db.get(User, user_id)


def get_user_by_email(db: Session, email: str):
    return db.scalar(
        select(User).where(User.email == email.lower())
    )


def get_users(db: Session, search: str | None, role: UserRoleType | None,
              is_active: bool | None, page: int, page_size: int):
    query = select(User)
    if search:
        pattern = f"%{search}%"
        query = query.where(or_(User.full_name.ilike(pattern), User.email.ilike(pattern)))
    if role is not None:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    users = db.scalars(
        query.order_by(User.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return users, total


def create_user(db: Session, data: dict):
    user = User(**data)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, data: dict):
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user
