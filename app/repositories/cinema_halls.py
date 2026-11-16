from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models.cinema_hall import CinemaHall
from ..models.seat import Seat


def get_halls(db: Session, is_active: bool | None):
    query = select(CinemaHall)
    if is_active is not None:
        query = query.where(CinemaHall.is_active == is_active)
    return db.scalars(query.order_by(CinemaHall.id)).all()


def get_hall_by_id(db: Session, hall_id: int):
    return db.get(CinemaHall, hall_id)


def get_hall_for_update(db: Session, hall_id: int):
    # Row lock on the hall serializes concurrent showtime/seat changes in the same hall
    return db.scalar(
        select(CinemaHall).where(CinemaHall.id == hall_id).with_for_update()
    )


def count_hall_seats(db: Session, hall_id: int) -> int:
    return db.scalar(
        select(func.count(Seat.id)).where(Seat.hall_id == hall_id)
    )


def create_hall(db: Session, data: dict):
    hall = CinemaHall(**data)
    db.add(hall)
    db.commit()
    db.refresh(hall)
    return hall


def update_hall(db: Session, hall: CinemaHall, data: dict):
    for key, value in data.items():
        setattr(hall, key, value)
    db.commit()
    db.refresh(hall)
    return hall
