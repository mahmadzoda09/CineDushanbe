from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models.movie import Movie


# Only these columns can be used for sorting; user input never goes into SQL text
SORT_FIELDS = {
    "id": Movie.id.asc(),
    "-id": Movie.id.desc(),
    "title": Movie.title.asc(),
    "-title": Movie.title.desc(),
}


def get_movies(db: Session, search: str | None, genre: str | None, age_rating: str | None,
               is_active: bool | None, sort: str, page: int, page_size: int):
    query = select(Movie)
    if search:
        query = query.where(Movie.title.ilike(f"%{search}%"))
    if genre:
        query = query.where(func.lower(Movie.genre) == genre.lower())
    if age_rating:
        query = query.where(Movie.age_rating == age_rating)
    if is_active is not None:
        query = query.where(Movie.is_active == is_active)

    total = db.scalar(select(func.count()).select_from(query.subquery()))
    movies = db.scalars(
        query.order_by(SORT_FIELDS[sort], Movie.id).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return movies, total


def get_movie_by_id(db: Session, movie_id: int):
    return db.get(Movie, movie_id)


def create_movie(db: Session, data: dict):
    movie = Movie(**data)
    db.add(movie)
    db.commit()
    db.refresh(movie)
    return movie


def update_movie(db: Session, movie: Movie, data: dict):
    for key, value in data.items():
        setattr(movie, key, value)
    db.commit()
    db.refresh(movie)
    return movie
