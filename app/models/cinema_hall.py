from typing import TYPE_CHECKING

from sqlalchemy import String, Integer, Boolean, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.database import Base

if TYPE_CHECKING:
    from .seat import Seat
    from .showtime import Showtime


class CinemaHall(Base):
    __tablename__ = "cinema_halls"
    __table_args__ = (
        CheckConstraint("capacity > 0", name="ck_cinema_halls_capacity_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    seats: Mapped[list["Seat"]] = relationship(
        back_populates="hall", order_by="[Seat.row_number, Seat.seat_number]"
    )
    showtimes: Mapped[list["Showtime"]] = relationship(back_populates="hall")
