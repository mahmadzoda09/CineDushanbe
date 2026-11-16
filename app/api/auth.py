from typing import Annotated

from fastapi import Depends
from fastapi.routing import APIRouter
from fastapi.security import OAuth2PasswordRequestForm

from ..schemas.auth import RegisterRequest, TokenResponse
from ..schemas.user import UserResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB
from ..services.users import register_user_service, login_user_service


router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=APIResponse[UserResponse], status_code=201)
def register(data: RegisterRequest, db: DB):
    user = register_user_service(db, data)
    return {"message": "User registered", "data": user}


@router.post("/login", response_model=TokenResponse)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    return login_user_service(db, form.username, form.password)
