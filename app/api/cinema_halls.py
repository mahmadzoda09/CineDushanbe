from fastapi.routing import APIRouter

from ..schemas.cinema_hall import CinemaHallCreate, CinemaHallUpdate, CinemaHallResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB
from ..auth.permissions import StaffUser
from ..services.cinema_halls import (get_halls_service, get_hall_by_id_service,
                                     create_hall_service, update_hall_service)


router = APIRouter(prefix="/halls", tags=["Cinema Halls"])


@router.get("", response_model=APIResponse[list[CinemaHallResponse]])
def get_halls(db: DB, is_active: bool | None = None):
    halls = get_halls_service(db, is_active)
    return {"message": "Cinema halls retrieved", "data": halls}


@router.get("/{hall_id}", response_model=APIResponse[CinemaHallResponse])
def get_hall(hall_id: int, db: DB):
    hall = get_hall_by_id_service(db, hall_id)
    return {"message": "Cinema hall retrieved", "data": hall}


@router.post("", response_model=APIResponse[CinemaHallResponse], status_code=201)
def create_hall(data: CinemaHallCreate, db: DB, user: StaffUser):
    hall = create_hall_service(db, data)
    return {"message": "Cinema hall created", "data": hall}


@router.patch("/{hall_id}", response_model=APIResponse[CinemaHallResponse])
def update_hall(hall_id: int, data: CinemaHallUpdate, db: DB, user: StaffUser):
    hall = update_hall_service(db, hall_id, data)
    return {"message": "Cinema hall updated", "data": hall}
