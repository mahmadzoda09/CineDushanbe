from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models.seat import Seat
from ..models.ticket import Ticket, TicketStatus


def get_seats_by_hall(db: Session, hall_id: int):
    return db.scalars(
        select(Seat)
        .where(Seat.hall_id == hall_id)
        .order_by(Seat.row_number, Seat.seat_number)
    ).all()


def get_seat_by_id(db: Session, seat_id: int):
    return db.get(Seat, seat_id)


def get_seat_map(db: Session, hall_id: int, showtime_id: int):
    # One query: every seat of the hall + whether it has a booked ticket for this showtime (no N+1)
    is_booked = (
        select(Ticket.id)
        .where(
            Ticket.seat_id == Seat.id,
            Ticket.showtime_id == showtime_id,
            Ticket.status == TicketStatus.BOOKED,
        )
        .exists()
    )
    return db.execute(
        select(Seat, is_booked.label("is_booked"))
        .where(Seat.hall_id == hall_id)
        .order_by(Seat.row_number, Seat.seat_number)
    ).all()


def create_seat(db: Session, data: dict):
    seat = Seat(**data)
    db.add(seat)
    db.commit()
    db.refresh(seat)
    return seat


def update_seat(db: Session, seat: Seat, data: dict):
    for key, value in data.items():
        setattr(seat, key, value)
    db.commit()
    db.refresh(seat)
    return seat
