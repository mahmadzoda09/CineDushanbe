from typing import TYPE_CHECKING

from sqlalchemy import String, Text, Integer, Boolean, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db.database import Base

if TYPE_CHECKING:
    from .showtime import Showtime


class Movie(Base):
    __tablename__ = "movies"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0", name="ck_movies_duration_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    genre: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    age_rating: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "0+", "12+", "18+"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    showtimes: Mapped[list["Showtime"]] = relationship(back_populates="movie")
