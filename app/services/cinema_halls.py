from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..schemas.cinema_hall import CinemaHallCreate, CinemaHallUpdate
from ..repositories.cinema_halls import (get_halls, get_hall_by_id, get_hall_for_update,
                                         count_hall_seats, create_hall, update_hall)


def get_halls_service(db: Session, is_active: bool | None):
    return get_halls(db, is_active)


def get_hall_by_id_service(db: Session, hall_id: int):
    hall = get_hall_by_id(db, hall_id)
    if hall is None:
        raise HTTPException(status_code=404, detail="Cinema hall not found")
    return hall


def create_hall_service(db: Session, data: CinemaHallCreate):
    try:
        return create_hall(db, data.model_dump())
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cinema hall with this name already exists")


def update_hall_service(db: Session, hall_id: int, data: CinemaHallUpdate):
    hall = get_hall_for_update(db, hall_id)
    if hall is None:
        raise HTTPException(status_code=404, detail="Cinema hall not found")

    values = data.model_dump(exclude_unset=True, exclude_none=True)
    if "capacity" in values and values["capacity"] < count_hall_seats(db, hall_id):
        raise HTTPException(status_code=409, detail="Capacity is less than the number of existing seats")

    try:
        return update_hall(db, hall, values)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Cinema hall with this name already exists")
