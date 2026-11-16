from datetime import date, datetime
from typing import Literal

from fastapi import Query
from fastapi.routing import APIRouter

from ..models.showtime import ShowtimeStatusType
from ..schemas.showtime import ShowtimeCreate, ShowtimeUpdate, ShowtimeResponse
from ..schemas.seat import SeatMapResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB
from ..auth.permissions import StaffUser
from ..services.showtimes import (get_showtimes_service, get_showtime_by_id_service,
                                  create_showtime_service, update_showtime_service,
                                  cancel_showtime_service, get_seat_map_service)


router = APIRouter(prefix="/showtimes", tags=["Showtimes"])


@router.get("", response_model=APIResponse[list[ShowtimeResponse]])
def get_showtimes(
    db: DB,
    movie_id: int | None = None,
    hall_id: int | None = None,
    status: ShowtimeStatusType | None = None,
    day: date | None = Query(default=None, description="Showtimes on this date (UTC)"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    sort: Literal["starts_at", "-starts_at"] = "starts_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    showtimes, meta = get_showtimes_service(db, movie_id, hall_id, status, day,
                                            date_from, date_to, sort, page, page_size)
    return {"message": "Showtimes retrieved", "data": showtimes, "meta": meta}


@router.get("/{showtime_id}", response_model=APIResponse[ShowtimeResponse])
def get_showtime(showtime_id: int, db: DB):
    showtime = get_showtime_by_id_service(db, showtime_id)
    return {"message": "Showtime retrieved", "data": showtime}


@router.get("/{showtime_id}/seats", response_model=APIResponse[SeatMapResponse])
def get_seat_map(showtime_id: int, db: DB):
    seat_map = get_seat_map_service(db, showtime_id)
    return {"message": "Seat map retrieved", "data": seat_map}


@router.post("", response_model=APIResponse[ShowtimeResponse], status_code=201)
def create_showtime(data: ShowtimeCreate, db: DB, user: StaffUser):
    showtime = create_showtime_service(db, data)
    return {"message": "Showtime created", "data": showtime}


@router.patch("/{showtime_id}", response_model=APIResponse[ShowtimeResponse])
def update_showtime(showtime_id: int, data: ShowtimeUpdate, db: DB, user: StaffUser):
    showtime = update_showtime_service(db, showtime_id, data)
    return {"message": "Showtime updated", "data": showtime}


@router.delete("/{showtime_id}", response_model=APIResponse[ShowtimeResponse])
def cancel_showtime(showtime_id: int, db: DB, user: StaffUser):
    showtime = cancel_showtime_service(db, showtime_id)
    return {"message": "Showtime cancelled, booked tickets were cancelled", "data": showtime}
