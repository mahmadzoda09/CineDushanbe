from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..schemas.seat import SeatCreate, SeatUpdate
from ..repositories.cinema_halls import get_hall_for_update, count_hall_seats
from ..repositories.seats import get_seats_by_hall, get_seat_by_id, create_seat, update_seat
from .cinema_halls import get_hall_by_id_service


SEAT_EXISTS = "Seat with this row and number already exists in the hall"


def get_hall_seats_service(db: Session, hall_id: int):
    get_hall_by_id_service(db, hall_id)
    return get_seats_by_hall(db, hall_id)


def create_seat_service(db: Session, hall_id: int, data: SeatCreate):
    hall = get_hall_for_update(db, hall_id)
    if hall is None:
        raise HTTPException(status_code=404, detail="Cinema hall not found")
    if count_hall_seats(db, hall_id) >= hall.capacity:
        raise HTTPException(status_code=409, detail="Hall capacity reached")

    try:
        return create_seat(db, {"hall_id": hall_id, **data.model_dump()})
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=SEAT_EXISTS)


def update_seat_service(db: Session, seat_id: int, data: SeatUpdate):
    seat = get_seat_by_id(db, seat_id)
    if seat is None:
        raise HTTPException(status_code=404, detail="Seat not found")

    try:
        return update_seat(db, seat, data.model_dump(exclude_unset=True, exclude_none=True))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=SEAT_EXISTS)
