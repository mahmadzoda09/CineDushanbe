from fastapi import Query
from fastapi.routing import APIRouter

from ..models.user import UserRoleType
from ..schemas.user import UserResponse, UserUpdate, UserRoleUpdate
from ..schemas.response import APIResponse
from ..auth.dependencies import DB, CurrentUser
from ..auth.permissions import AdminUser
from ..services.users import update_me_service, get_users_service, change_role_service


router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=APIResponse[UserResponse])
def read_me(current_user: CurrentUser):
    return {"message": "Profile retrieved", "data": current_user}


@router.patch("/me", response_model=APIResponse[UserResponse])
def update_me(data: UserUpdate, db: DB, current_user: CurrentUser):
    user = update_me_service(db, current_user, data)
    return {"message": "Profile updated", "data": user}


@router.get("", response_model=APIResponse[list[UserResponse]])
def list_users(
    db: DB,
    admin: AdminUser,
    search: str | None = Query(default=None, max_length=100),
    role: UserRoleType | None = None,
    is_active: bool | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    users, meta = get_users_service(db, search, role, is_active, page, page_size)
    return {"message": "Users retrieved", "data": users, "meta": meta}


@router.patch("/{user_id}/role", response_model=APIResponse[UserResponse])
def change_role(user_id: int, data: UserRoleUpdate, db: DB, admin: AdminUser):
    user = change_role_service(db, admin, user_id, data)
    return {"message": "Role updated", "data": user}
