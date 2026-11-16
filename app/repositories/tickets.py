from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models.ticket import Ticket, TicketStatus, TicketStatusType


SORT_FIELDS = {
    "booked_at": Ticket.booked_at.asc(),
    "-booked_at": Ticket.booked_at.desc(),
}


def get_tickets(db: Session, user_id: int | None, showtime_id: int | None,
                status: TicketStatusType | None, sort: str, page: int, page_size: int):
    query = select(Ticket)
    if user_id is not None:
        query = query.where(Ticket.user_id == user_id)
    if showtime_id is not None:
        query = query.where(Ticket.showtime_id == showtime_id)
    if status is not None:
        query = query.where(Ticket.status == status)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    tickets = db.scalars(
        query.order_by(SORT_FIELDS[sort], Ticket.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return tickets, total


def get_ticket_by_id(db: Session, ticket_id: int):
    return db.get(Ticket, ticket_id)


def is_seat_booked(db: Session, showtime_id: int, seat_id: int) -> bool:
    return db.scalar(
        select(
            select(Ticket.id).where(
                Ticket.showtime_id == showtime_id,
                Ticket.seat_id == seat_id,
                Ticket.status == TicketStatus.BOOKED,
            ).exists()
        )
    )


def create_ticket(db: Session, data: dict):
    # May raise IntegrityError from uq_tickets_showtime_seat_booked; the service handles it
    ticket = Ticket(**data)
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


def cancel_ticket(db: Session, ticket: Ticket):
    ticket.status = TicketStatus.CANCELLED
    ticket.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ticket)
    return ticket
