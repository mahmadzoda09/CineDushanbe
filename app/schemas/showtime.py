from datetime import datetime
from decimal import Decimal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from ..models.showtime import ShowtimeStatusType


class ShowtimeCreate(BaseModel):
    movie_id: int
    hall_id: int
    starts_at: AwareDatetime  # must include a timezone, e.g. "2026-12-01T18:00:00Z"
    ticket_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)


class ShowtimeUpdate(BaseModel):
    movie_id: int | None = Field(default=None)
    hall_id: int | None = Field(default=None)
    starts_at: AwareDatetime | None = Field(default=None)
    ticket_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    status: ShowtimeStatusType | None = Field(default=None)


class ShowtimeResponse(BaseModel):
    id: int
    movie_id: int
    hall_id: int
    starts_at: datetime
    ends_at: datetime
    status: ShowtimeStatusType
    ticket_price: Decimal
    model_config = ConfigDict(from_attributes=True)
