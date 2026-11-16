from fastapi.routing import APIRouter

from ..schemas.seat import SeatCreate, SeatUpdate, SeatResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB
from ..auth.permissions import StaffUser
from ..services.seats import get_hall_seats_service, create_seat_service, update_seat_service


router = APIRouter(tags=["Seats"])


@router.get("/halls/{hall_id}/seats", response_model=APIResponse[list[SeatResponse]])
def get_hall_seats(hall_id: int, db: DB):
    seats = get_hall_seats_service(db, hall_id)
    return {"message": "Seats retrieved", "data": seats}


@router.post("/halls/{hall_id}/seats", response_model=APIResponse[SeatResponse], status_code=201)
def create_seat(hall_id: int, data: SeatCreate, db: DB, user: StaffUser):
    seat = create_seat_service(db, hall_id, data)
    return {"message": "Seat created", "data": seat}


@router.patch("/seats/{seat_id}", response_model=APIResponse[SeatResponse])
def update_seat(seat_id: int, data: SeatUpdate, db: DB, user: StaffUser):
    seat = update_seat_service(db, seat_id, data)
    return {"message": "Seat updated", "data": seat}
