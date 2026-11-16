from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.user import User, UserRole
from ..models.showtime import ShowtimeStatus
from ..models.ticket import TicketStatus
from ..schemas.ticket import TicketCreate
from ..schemas.response import PaginationMeta
from ..repositories.seats import get_seat_by_id
from ..repositories.showtimes import get_showtime_by_id
from ..repositories.tickets import (get_tickets, get_ticket_by_id, is_seat_booked,
                                    create_ticket, cancel_ticket)
from ..auth.permissions import is_staff
from .showtimes import to_utc


SEAT_ALREADY_BOOKED = "Seat already booked"


def book_ticket_service(db: Session, user: User, data: TicketCreate):
    showtime = get_showtime_by_id(db, data.showtime_id)
    if showtime is None:
        raise HTTPException(status_code=404, detail="Showtime not found")

    seat = get_seat_by_id(db, data.seat_id)
    if seat is None:
        raise HTTPException(status_code=404, detail="Seat not found")

    if seat.hall_id != showtime.hall_id:
        raise HTTPException(status_code=422, detail="Seat does not belong to the showtime hall")
    if showtime.status != ShowtimeStatus.SCHEDULED:
        raise HTTPException(status_code=409, detail=f"Showtime is {showtime.status}")
    if to_utc(showtime.starts_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Showtime has already started")
    if not seat.is_active:
        raise HTTPException(status_code=409, detail="Seat is not available")

    # Fast path only; the real guarantee is the partial unique index below
    if is_seat_booked(db, showtime.id, seat.id):
        raise HTTPException(status_code=409, detail=SEAT_ALREADY_BOOKED)

    try:
        return create_ticket(db, {
            "user_id": user.id,  # always from JWT, never from the request body
            "showtime_id": showtime.id,
            "seat_id": seat.id,
            "price": showtime.ticket_price,  # price is fixed at booking time
            "status": TicketStatus.BOOKED,
        })
    except IntegrityError:
        # Concurrent request booked the same seat: uq_tickets_showtime_seat_booked violated
        db.rollback()
        raise HTTPException(status_code=409, detail=SEAT_ALREADY_BOOKED)


def get_my_tickets_service(db: Session, user: User, showtime_id, ticket_status,
                           sort: str, page: int, page_size: int):
    tickets, total = get_tickets(db, user.id, showtime_id, ticket_status, sort, page, page_size)
    return tickets, PaginationMeta.create(total, page, page_size)


def get_all_tickets_service(db: Session, user_id, showtime_id, ticket_status,
                            sort: str, page: int, page_size: int):
    tickets, total = get_tickets(db, user_id, showtime_id, ticket_status, sort, page, page_size)
    return tickets, PaginationMeta.create(total, page, page_size)


def get_ticket_service(db: Session, user: User, ticket_id: int):
    ticket = get_ticket_by_id(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != user.id and not is_staff(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    return ticket


def cancel_ticket_service(db: Session, user: User, ticket_id: int):
    ticket = get_ticket_by_id(db, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    if ticket.status != TicketStatus.BOOKED:
        raise HTTPException(status_code=409, detail="Ticket is already cancelled")
    if to_utc(ticket.showtime.starts_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Cannot cancel a ticket after the showtime has started")

    return cancel_ticket(db, ticket)
