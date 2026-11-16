from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..schemas.movie import MovieCreate, MovieUpdate
from ..schemas.response import PaginationMeta
from ..repositories.movies import get_movies, get_movie_by_id, create_movie, update_movie


def get_movies_service(db: Session, search, genre, age_rating, is_active,
                       sort: str, page: int, page_size: int):
    movies, total = get_movies(db, search, genre, age_rating, is_active, sort, page, page_size)
    return movies, PaginationMeta.create(total, page, page_size)


def get_movie_by_id_service(db: Session, movie_id: int):
    movie = get_movie_by_id(db, movie_id)
    if movie is None:
        raise HTTPException(status_code=404, detail="Movie not found")
    return movie


def create_movie_service(db: Session, data: MovieCreate):
    return create_movie(db, data.model_dump())


def update_movie_service(db: Session, movie_id: int, data: MovieUpdate):
    movie = get_movie_by_id_service(db, movie_id)
    return update_movie(db, movie, data.model_dump(exclude_unset=True))


def deactivate_movie_service(db: Session, movie_id: int):
    # Soft delete: movies with showtimes/tickets must keep their history
    movie = get_movie_by_id_service(db, movie_id)
    return update_movie(db, movie, {"is_active": False})
