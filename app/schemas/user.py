from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from ..models.user import UserRoleType


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class UserRoleUpdate(BaseModel):
    role: UserRoleType


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: UserRoleType
    is_active: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
