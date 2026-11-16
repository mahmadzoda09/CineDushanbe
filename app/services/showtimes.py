from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..models.showtime import Showtime, ShowtimeStatus
from ..schemas.showtime import ShowtimeCreate, ShowtimeUpdate
from ..schemas.response import PaginationMeta
from ..repositories.movies import get_movie_by_id
from ..repositories.cinema_halls import get_hall_for_update
from ..repositories.seats import get_seat_map
from ..repositories.showtimes import (get_showtimes, get_showtime_by_id, has_overlapping_showtime,
                                      count_booked_tickets, create_showtime, update_showtime,
                                      cancel_showtime)


def to_utc(value: datetime) -> datetime:
    # Some drivers (e.g. SQLite) return naive datetimes; treat them as UTC
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_showtimes_service(db: Session, movie_id, hall_id, status, day: date | None,
                          date_from: datetime | None, date_to: datetime | None,
                          sort: str, page: int, page_size: int):
    if day is not None:
        date_from = datetime.combine(day, time.min, tzinfo=timezone.utc)
        date_to = date_from + timedelta(days=1)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    showtimes, total = get_showtimes(db, movie_id, hall_id, status, date_from, date_to,
                                     sort, page, page_size)
    return showtimes, PaginationMeta.create(total, page, page_size)


def get_showtime_by_id_service(db: Session, showtime_id: int) -> Showtime:
    showtime = get_showtime_by_id(db, showtime_id)
    if showtime is None:
        raise HTTPException(status_code=404, detail="Showtime not found")
    return showtime


def _check_schedule(db: Session, movie_id: int, hall_id: int, starts_at: datetime,
                    exclude_id: int | None = None) -> datetime:
    # Validates movie/hall and the time slot; returns the computed ends_at
    movie = get_movie_by_id(db, movie_id)
    if movie is None:
        raise HTTPException(status_code=404, detail="Movie not found")
    if not movie.is_active:
        raise HTTPException(status_code=400, detail="Movie is not active")

    hall = get_hall_for_update(db, hall_id)
    if hall is None:
        raise HTTPException(status_code=404, detail="Cinema hall not found")
    if not hall.is_active:
        raise HTTPException(status_code=400, detail="Cinema hall is not active")

    if starts_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Showtime must start in the future")

    ends_at = starts_at + timedelta(minutes=movie.duration_minutes)
    if has_overlapping_showtime(db, hall_id, starts_at, ends_at, exclude_id):
        raise HTTPException(status_code=409, detail="Showtime overlaps with another showtime in this hall")
    return ends_at


def create_showtime_service(db: Session, data: ShowtimeCreate):
    starts_at = to_utc(data.starts_at)
    ends_at = _check_schedule(db, data.movie_id, data.hall_id, starts_at)

    return create_showtime(db, {
        "movie_id": data.movie_id,
        "hall_id": data.hall_id,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "ticket_price": data.ticket_price,
    })


def update_showtime_service(db: Session, showtime_id: int, data: ShowtimeUpdate):
    showtime = get_showtime_by_id_service(db, showtime_id)
    if showtime.status != ShowtimeStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled showtimes can be changed")

    values = data.model_dump(exclude_unset=True, exclude_none=True)
    new_status = values.pop("status", None)

    if {"movie_id", "hall_id", "starts_at"} & values.keys():
        hall_id = values.get("hall_id", showtime.hall_id)
        if hall_id != showtime.hall_id and count_booked_tickets(db, showtime.id):
            raise HTTPException(status_code=409, detail="Cannot change the hall of a showtime with booked tickets")

        starts_at = to_utc(values.get("starts_at", showtime.starts_at))
        values["starts_at"] = starts_at
        values["ends_at"] = _check_schedule(
            db, values.get("movie_id", showtime.movie_id), hall_id, starts_at, exclude_id=showtime.id
        )

    if new_status == ShowtimeStatus.FINISHED:
        values["status"] = ShowtimeStatus.FINISHED

    showtime = update_showtime(db, showtime, values)

    if new_status == ShowtimeStatus.CANCELLED:
        showtime = cancel_showtime(db, showtime)
    return showtime


def cancel_showtime_service(db: Session, showtime_id: int):
    showtime = get_showtime_by_id_service(db, showtime_id)
    if showtime.status != ShowtimeStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail="Only scheduled showtimes can be cancelled")
    return cancel_showtime(db, showtime)


def get_seat_map_service(db: Session, showtime_id: int):
    showtime = get_showtime_by_id_service(db, showtime_id)
    hall = showtime.hall

    rows = {}
    summary = {"total": 0, "available": 0, "booked": 0, "unavailable": 0}

    for seat, is_booked in get_seat_map(db, hall.id, showtime.id):
        if not seat.is_active:
            seat_status = "unavailable"
        elif is_booked:
            seat_status = "booked"
        else:
            seat_status = "available"

        summary["total"] += 1
        summary[seat_status] += 1
        # Seats come ordered by (row_number, seat_number), so dict order is already correct
        rows.setdefault(seat.row_number, []).append(
            {"id": seat.id, "seat_number": seat.seat_number, "status": seat_status}
        )

    return {
        "showtime_id": showtime.id,
        "hall_id": hall.id,
        "hall_name": hall.name,
        "summary": summary,
        "rows": [{"row_number": row, "seats": seats} for row, seats in rows.items()],
    }
