from typing import Literal

from fastapi import Query
from fastapi.routing import APIRouter

from ..models.ticket import TicketStatusType
from ..schemas.ticket import TicketCreate, TicketResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB, CurrentUser
from ..auth.permissions import StaffUser
from ..services.tickets import (book_ticket_service, get_my_tickets_service, get_all_tickets_service,
                                get_ticket_service, cancel_ticket_service)


router = APIRouter(prefix="/tickets", tags=["Tickets"])

TicketSort = Literal["booked_at", "-booked_at"]


@router.post("", response_model=APIResponse[TicketResponse], status_code=201)
def book_ticket(data: TicketCreate, db: DB, current_user: CurrentUser):
    ticket = book_ticket_service(db, current_user, data)
    return {"message": "Ticket booked", "data": ticket}


@router.get("/my", response_model=APIResponse[list[TicketResponse]])
def get_my_tickets(
    db: DB,
    current_user: CurrentUser,
    status: TicketStatusType | None = None,
    showtime_id: int | None = None,
    sort: TicketSort = "-booked_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    tickets, meta = get_my_tickets_service(db, current_user, showtime_id, status, sort, page, page_size)
    return {"message": "Tickets retrieved", "data": tickets, "meta": meta}


@router.get("", response_model=APIResponse[list[TicketResponse]])
def get_all_tickets(
    db: DB,
    user: StaffUser,
    user_id: int | None = None,
    showtime_id: int | None = None,
    status: TicketStatusType | None = None,
    sort: TicketSort = "-booked_at",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    tickets, meta = get_all_tickets_service(db, user_id, showtime_id, status, sort, page, page_size)
    return {"message": "Tickets retrieved", "data": tickets, "meta": meta}


@router.get("/{ticket_id}", response_model=APIResponse[TicketResponse])
def get_ticket(ticket_id: int, db: DB, current_user: CurrentUser):
    ticket = get_ticket_service(db, current_user, ticket_id)
    return {"message": "Ticket retrieved", "data": ticket}


@router.post("/{ticket_id}/cancel", response_model=APIResponse[TicketResponse])
def cancel_ticket(ticket_id: int, db: DB, current_user: CurrentUser):
    ticket = cancel_ticket_service(db, current_user, ticket_id)
    return {"message": "Ticket cancelled", "data": ticket}
