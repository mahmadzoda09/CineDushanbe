from datetime import datetime, timezone

from sqlalchemy import select, func, update
from sqlalchemy.orm import Session

from ..models.showtime import Showtime, ShowtimeStatus, ShowtimeStatusType
from ..models.ticket import Ticket, TicketStatus


SORT_FIELDS = {
    "starts_at": Showtime.starts_at.asc(),
    "-starts_at": Showtime.starts_at.desc(),
}


def get_showtimes(db: Session, movie_id: int | None, hall_id: int | None,
                  status: ShowtimeStatusType | None, date_from: datetime | None,
                  date_to: datetime | None, sort: str, page: int, page_size: int):
    query = select(Showtime)
    if movie_id is not None:
        query = query.where(Showtime.movie_id == movie_id)
    if hall_id is not None:
        query = query.where(Showtime.hall_id == hall_id)
    if status is not None:
        query = query.where(Showtime.status == status)
    if date_from is not None:
        query = query.where(Showtime.starts_at >= date_from)
    if date_to is not None:
        query = query.where(Showtime.starts_at < date_to)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    showtimes = db.scalars(
        query.order_by(SORT_FIELDS[sort], Showtime.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return showtimes, total


def get_showtime_by_id(db: Session, showtime_id: int):
    return db.get(Showtime, showtime_id)


def has_overlapping_showtime(db: Session, hall_id: int, starts_at: datetime,
                             ends_at: datetime, exclude_id: int | None = None) -> bool:
    # Overlap: existing.starts_at < new.ends_at AND existing.ends_at > new.starts_at
    query = select(Showtime.id).where(
        Showtime.hall_id == hall_id,
        Showtime.status != ShowtimeStatus.CANCELLED,
        Showtime.starts_at < ends_at,
        Showtime.ends_at > starts_at,
    )
    if exclude_id is not None:
        query = query.where(Showtime.id != exclude_id)
    return db.scalar(select(query.exists()))


def count_booked_tickets(db: Session, showtime_id: int) -> int:
    return db.scalar(
        select(func.count(Ticket.id)).where(
            Ticket.showtime_id == showtime_id,
            Ticket.status == TicketStatus.BOOKED,
        )
    )


def create_showtime(db: Session, data: dict):
    showtime = Showtime(**data)
    db.add(showtime)
    db.commit()
    db.refresh(showtime)
    return showtime


def update_showtime(db: Session, showtime: Showtime, data: dict):
    for key, value in data.items():
        setattr(showtime, key, value)
    db.commit()
    db.refresh(showtime)
    return showtime


def cancel_showtime(db: Session, showtime: Showtime):
    # Cancel the showtime and all its booked tickets in one transaction (history is kept)
    showtime.status = ShowtimeStatus.CANCELLED
    db.execute(
        update(Ticket)
        .where(Ticket.showtime_id == showtime.id, Ticket.status == TicketStatus.BOOKED)
        .values(status=TicketStatus.CANCELLED, cancelled_at=datetime.now(timezone.utc))
    )
    db.commit()
    db.refresh(showtime)
    return showtime
