from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SeatCreate(BaseModel):
    row_number: int = Field(gt=0)
    seat_number: int = Field(gt=0)
    is_active: bool = Field(default=True)


class SeatUpdate(BaseModel):
    row_number: int | None = Field(default=None, gt=0)
    seat_number: int | None = Field(default=None, gt=0)
    is_active: bool | None = Field(default=None)


class SeatResponse(SeatCreate):
    id: int
    hall_id: int
    model_config = ConfigDict(from_attributes=True)


# Seat map for a showtime: GET /showtimes/{id}/seats

SeatStatus = Literal["available", "booked", "unavailable"]


class SeatAvailabilityResponse(BaseModel):
    id: int
    seat_number: int
    status: SeatStatus


class SeatRowResponse(BaseModel):
    row_number: int
    seats: list[SeatAvailabilityResponse]


class SeatMapSummary(BaseModel):
    total: int = 0
    available: int = 0
    booked: int = 0
    unavailable: int = 0


class SeatMapResponse(BaseModel):
    showtime_id: int
    hall_id: int
    hall_name: str
    summary: SeatMapSummary
    rows: list[SeatRowResponse]
