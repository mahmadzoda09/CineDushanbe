"""Demo data for CineDushanbe: users, movies, halls, seats, showtimes and tickets.

Run from the project root:  python -m app.seed
Safe to run again — existing users, movies and halls are skipped.
"""
import random
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import select, func

from .db.database import Base, engine, SessionLocal
from .models import User, UserRole, Movie, CinemaHall, Seat, Showtime, ShowtimeStatus, Ticket, TicketStatus
from .auth.security import hash_password


DUSHANBE_TZ = timezone(timedelta(hours=5))
DAYS_AHEAD = 7
START_TIMES = [time(11, 0), time(14, 30), time(18, 0), time(21, 30)]  # gaps fit the longest movie

DEMO_USERS = [
    # full_name, email, password, role
    ("Demo Admin", "admin@example.com", "Admin12345", UserRole.ADMIN),
    ("Farrukh Manager", "manager@example.com", "Manager12345", UserRole.CINEMA_MANAGER),
    ("Ali Rahimov", "ali.rahimov@example.com", "Demo12345", UserRole.CUSTOMER),
    ("Madina Karimova", "madina.karimova@example.com", "Demo12345", UserRole.CUSTOMER),
    ("Firuz Saidov", "firuz.saidov@example.com", "Demo12345", UserRole.CUSTOMER),
    ("Nigina Nazarova", "nigina.nazarova@example.com", "Demo12345", UserRole.CUSTOMER),
]

DEMO_MOVIES = [
    # title, genre, minutes, age, description
    ("Дюна: Часть вторая", "Фантастика", 166, "12+",
     "Пол Атрейдес объединяется с фрименами, чтобы отомстить заговорщикам, уничтожившим его семью."),
    ("Интерстеллар", "Фантастика", 169, "12+",
     "Группа исследователей отправляется сквозь червоточину в поисках нового дома для человечества."),
    ("Оппенгеймер", "Драма", 180, "18+",
     "История физика Роберта Оппенгеймера и создания первой атомной бомбы."),
    ("Головоломка 2", "Мультфильм", 96, "6+",
     "Райли становится подростком, и в штабе её эмоций появляются новые неожиданные соседи."),
    ("Король Лев", "Мультфильм", 118, "6+",
     "Юный львёнок Симба должен принять своё предназначение и стать королём саванны."),
    ("Начало", "Триллер", 148, "12+",
     "Профессиональный вор проникает в сны людей, чтобы похищать их секреты — и однажды должен внедрить идею."),
    ("Гладиатор II", "Боевик", 148, "18+",
     "Спустя годы после гибели Максимуса новый герой выходит на арену Колизея."),
    ("Аватар: Путь воды", "Приключения", 192, "12+",
     "Джейк Салли и его семья ищут убежища у морских кланов Пандоры."),
]

DEMO_HALLS = [
    # name, rows, seats per row, ticket price (TJS), inactive seats (row, seat)
    ("Большой зал", 8, 12, 40, [(1, 1), (1, 12)]),
    ("Малый зал", 6, 10, 35, [(6, 5)]),
    ("VIP-зал", 4, 6, 80, []),
]


def seed_users(db) -> list[User]:
    users = []
    for full_name, email, password, role in DEMO_USERS:
        user = db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(full_name=full_name, email=email, password_hash=hash_password(password), role=role)
            db.add(user)
        users.append(user)
    db.commit()
    return users


def seed_movies(db) -> list[Movie]:
    movies = []
    for title, genre, minutes, age, description in DEMO_MOVIES:
        movie = db.scalar(select(Movie).where(Movie.title == title))
        if movie is None:
            movie = Movie(title=title, genre=genre, duration_minutes=minutes, age_rating=age, description=description)
            db.add(movie)
        movies.append(movie)
    db.commit()
    return movies


def seed_halls(db) -> list[tuple[CinemaHall, int]]:
    halls = []
    for name, rows, per_row, price, inactive in DEMO_HALLS:
        hall = db.scalar(select(CinemaHall).where(CinemaHall.name == name))
        if hall is None:
            hall = CinemaHall(name=name, capacity=rows * per_row)
            db.add(hall)
            db.flush()
            db.add_all(
                Seat(hall_id=hall.id, row_number=r, seat_number=n, is_active=(r, n) not in inactive)
                for r in range(1, rows + 1)
                for n in range(1, per_row + 1)
            )
        halls.append((hall, price))
    db.commit()
    return halls


def seed_showtimes(db, movies: list[Movie], halls: list[tuple[CinemaHall, int]]) -> list[Showtime]:
    now = datetime.now(timezone.utc)
    hall_ids = [hall.id for hall, _ in halls]
    already = db.scalar(
        select(func.count()).select_from(Showtime)
        .where(Showtime.hall_id.in_(hall_ids), Showtime.starts_at > now)
    )
    if already:
        return []

    rnd = random.Random(42)
    today = now.astimezone(DUSHANBE_TZ).date()
    showtimes = []
    for day_offset in range(DAYS_AHEAD):
        day = today + timedelta(days=day_offset)
        for hall, price in halls:
            for start in START_TIMES:
                starts_at = datetime.combine(day, start, tzinfo=DUSHANBE_TZ).astimezone(timezone.utc)
                if starts_at <= now + timedelta(minutes=30):
                    continue
                movie = rnd.choice(movies)
                evening = start.hour >= 18
                showtimes.append(Showtime(
                    movie_id=movie.id,
                    hall_id=hall.id,
                    starts_at=starts_at,
                    ends_at=starts_at + timedelta(minutes=movie.duration_minutes),
                    ticket_price=price + (10 if evening else 0),
                    status=ShowtimeStatus.SCHEDULED,
                ))
    db.add_all(showtimes)
    db.commit()
    return showtimes


def seed_tickets(db, users: list[User], showtimes: list[Showtime]) -> int:
    if not showtimes:
        return 0
    rnd = random.Random(7)
    customers = [u for u in users if u.role == UserRole.CUSTOMER]
    taken: set[tuple[int, int]] = set()
    count = 0

    for customer in customers:
        for showtime in rnd.sample(showtimes, k=min(3, len(showtimes))):
            seats = db.scalars(
                select(Seat).where(Seat.hall_id == showtime.hall_id, Seat.is_active.is_(True))
            ).all()
            free = [s for s in seats if (showtime.id, s.id) not in taken]
            for seat in rnd.sample(free, k=min(rnd.randint(1, 2), len(free))):
                taken.add((showtime.id, seat.id))
                db.add(Ticket(
                    user_id=customer.id,
                    showtime_id=showtime.id,
                    seat_id=seat.id,
                    price=showtime.ticket_price,
                    status=TicketStatus.BOOKED,
                ))
                count += 1
    db.flush()

    # One cancelled ticket per customer, to show the "Отменённые" tab
    for customer in customers:
        ticket = db.scalar(select(Ticket).where(Ticket.user_id == customer.id).limit(1))
        if ticket:
            ticket.status = TicketStatus.CANCELLED
            ticket.cancelled_at = datetime.now(timezone.utc)
    db.commit()
    return count


def main():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        users = seed_users(db)
        movies = seed_movies(db)
        halls = seed_halls(db)
        showtimes = seed_showtimes(db, movies, halls)
        tickets = seed_tickets(db, users, showtimes)

    print(f"Users: {len(users)}, movies: {len(movies)}, halls: {len(halls)}, "
          f"new showtimes: {len(showtimes)}, new tickets: {tickets}")
    print("\nDemo accounts:")
    for full_name, email, password, role in DEMO_USERS:
        print(f"  {role:<15} {email:<30} {password:<14} {full_name}")


if __name__ == "__main__":
    main()
