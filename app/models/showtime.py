from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Literal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.database import Base

if TYPE_CHECKING:
    from .cinema_hall import CinemaHall
    from .movie import Movie
    from .ticket import Ticket


class ShowtimeStatus:
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    FINISHED = "finished"


ShowtimeStatusType = Literal["scheduled", "cancelled", "finished"]


class Showtime(Base):
    __tablename__ = "showtimes"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at", name="ck_showtimes_time_range"),
        CheckConstraint("ticket_price > 0", name="ck_showtimes_price_positive"),
        CheckConstraint("status IN ('scheduled', 'cancelled', 'finished')", name="ck_showtimes_status"),
        Index("ix_showtimes_hall_starts_at", "hall_id", "starts_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    movie_id: Mapped[int] = mapped_column(
        ForeignKey("movies.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    hall_id: Mapped[int] = mapped_column(
        ForeignKey("cinema_halls.id", ondelete="RESTRICT"), nullable=False
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20),
        default=ShowtimeStatus.SCHEDULED,
        server_default=ShowtimeStatus.SCHEDULED,
        nullable=False,
    )
    ticket_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    movie: Mapped["Movie"] = relationship(back_populates="showtimes")
    hall: Mapped["CinemaHall"] = relationship(back_populates="showtimes")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="showtime")
