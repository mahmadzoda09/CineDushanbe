from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Literal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, CheckConstraint, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.database import Base

if TYPE_CHECKING:
    from .seat import Seat
    from .showtime import Showtime
    from .user import User


class TicketStatus:
    BOOKED = "booked"
    CANCELLED = "cancelled"


TicketStatusType = Literal["booked", "cancelled"]


class Ticket(Base):
    __tablename__ = "tickets"
    __table_args__ = (
        CheckConstraint("price > 0", name="ck_tickets_price_positive"),
        CheckConstraint("status IN ('booked', 'cancelled')", name="ck_tickets_status"),
        # Only one booked ticket per seat per showtime; cancelled tickets do not block resale
        Index(
            "uq_tickets_showtime_seat_booked",
            "showtime_id",
            "seat_id",
            unique=True,
            postgresql_where=text("status = 'booked'"),
            sqlite_where=text("status = 'booked'"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    showtime_id: Mapped[int] = mapped_column(
        ForeignKey("showtimes.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    seat_id: Mapped[int] = mapped_column(
        ForeignKey("seats.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)  # fixed at booking time
    status: Mapped[str] = mapped_column(
        String(20),
        default=TicketStatus.BOOKED,
        server_default=TicketStatus.BOOKED,
        nullable=False,
    )
    booked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="tickets")
    showtime: Mapped["Showtime"] = relationship(back_populates="tickets")
    seat: Mapped["Seat"] = relationship(back_populates="tickets")
