# CineDushanbe — CinemaBooking

REST API for movies, cinema halls, seats, showtimes and tickets (FastAPI + SQLAlchemy 2 + PostgreSQL).
A customer picks a showtime and a seat; the database guarantees the seat cannot be booked twice.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

copy .env.example .env          # then edit DATABASE_URL and SECRET_KEY
uvicorn app.main:app --reload
```

Website (CineDushanbe frontend): http://127.0.0.1:8000/

Swagger UI: http://127.0.0.1:8000/docs. Log in through **Authorize**, putting your email in the `username` field.

Tables are created on startup. If `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD` are set, an admin user is created too.

## Demo data

```bash
python -m app.seed
```

Adds 8 movies, 3 halls with seats, showtimes for the next 7 days, some booked tickets and these accounts
(safe to run again — existing records are skipped):

| Role           | Email                       | Password     |
|----------------|-----------------------------|--------------|
| admin          | admin@example.com           | Admin12345   |
| cinema_manager | manager@example.com         | Manager12345 |
| customer       | ali.rahimov@example.com     | Demo12345    |
| customer       | madina.karimova@example.com | Demo12345    |
| customer       | firuz.saidov@example.com    | Demo12345    |
| customer       | nigina.nazarova@example.com | Demo12345    |

## Structure

```
frontend/        CineDushanbe web UI (plain HTML/CSS/JS, served by FastAPI at /)
app/
  api/           routers (one file per resource), all mounted under /api/v1
  auth/          password hashing + JWT (security.py), current user (dependencies.py), roles (permissions.py)
  core/          settings from .env
  db/            engine, session, Base, get_db
  models/        SQLAlchemy models
  schemas/       Pydantic Create / Update / Response schemas + APIResponse envelope
  repositories/  SQLAlchemy queries
  services/      business rules (validation, permissions, conflicts)
```

Request flow: `api` → `services` → `repositories` → database.

## Roles

| Role           | Can do |
|----------------|--------|
| admin          | everything, including changing user roles |
| cinema_manager | create and update movies, halls, seats and showtimes; view all tickets |
| customer       | browse, book tickets, view and cancel own tickets |

New users always register as `customer`. Admins change roles with `PATCH /api/v1/users/{id}/role`.

## Double-booking protection

`tickets` has a partial unique index `uq_tickets_showtime_seat_booked` on `(showtime_id, seat_id) WHERE status = 'booked'`.
When two requests try to book the same seat at the same time, PostgreSQL accepts only one insert.
The other request gets an `IntegrityError`; the service rolls back and returns **409 Seat already booked**.
Cancelled tickets do not count toward the index, so a cancelled seat can be sold again.

Showtime overlap is checked in the service. The hall row is locked first (`SELECT ... FOR UPDATE`), so two managers cannot create overlapping showtimes in the same hall at the same time.

## Response format

```json
{ "success": true, "message": "Ticket booked", "data": { ... }, "meta": null }
{ "success": false, "message": "Seat already booked", "data": null }
```

List endpoints return `meta: {total, page, page_size, total_pages}`.
