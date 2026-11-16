from pydantic import BaseModel, ConfigDict, Field


AGE_RATING_PATTERN = r"^\d{1,2}\+$"  # "0+", "12+", "18+"


class MovieCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None)
    duration_minutes: int = Field(gt=0)
    genre: str | None = Field(default=None, max_length=100)
    age_rating: str | None = Field(default=None, max_length=10, pattern=AGE_RATING_PATTERN)


class MovieUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None)
    duration_minutes: int | None = Field(default=None, gt=0)
    genre: str | None = Field(default=None, max_length=100)
    age_rating: str | None = Field(default=None, max_length=10, pattern=AGE_RATING_PATTERN)
    is_active: bool | None = Field(default=None)


class MovieResponse(MovieCreate):
    id: int
    is_active: bool
    model_config = ConfigDict(from_attributes=True)
