from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict

from ..models.ticket import TicketStatusType


class TicketCreate(BaseModel):
    showtime_id: int
    seat_id: int


class TicketResponse(BaseModel):
    id: int
    user_id: int
    showtime_id: int
    seat_id: int
    price: Decimal
    status: TicketStatusType
    booked_at: datetime
    cancelled_at: datetime | None
    model_config = ConfigDict(from_attributes=True)
