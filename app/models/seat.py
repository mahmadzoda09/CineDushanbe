from typing import TYPE_CHECKING

from sqlalchemy import Integer, Boolean, ForeignKey, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.database import Base

if TYPE_CHECKING:
    from .cinema_hall import CinemaHall
    from .ticket import Ticket


class Seat(Base):
    __tablename__ = "seats"
    __table_args__ = (
        UniqueConstraint("hall_id", "row_number", "seat_number", name="uq_seats_hall_row_seat"),
        CheckConstraint("row_number > 0", name="ck_seats_row_positive"),
        CheckConstraint("seat_number > 0", name="ck_seats_number_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    hall_id: Mapped[int] = mapped_column(
        ForeignKey("cinema_halls.id", ondelete="RESTRICT"), index=True, nullable=False
    )
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    seat_number: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    hall: Mapped["CinemaHall"] = relationship(back_populates="seats")
    tickets: Mapped[list["Ticket"]] = relationship(back_populates="seat")
