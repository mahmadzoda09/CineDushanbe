from typing import Literal

from fastapi import Query
from fastapi.routing import APIRouter

from ..schemas.movie import MovieCreate, MovieUpdate, MovieResponse
from ..schemas.response import APIResponse
from ..auth.dependencies import DB
from ..auth.permissions import StaffUser
from ..services.movies import (get_movies_service, get_movie_by_id_service, create_movie_service,
                               update_movie_service, deactivate_movie_service)


router = APIRouter(prefix="/movies", tags=["Movies"])


@router.get("", response_model=APIResponse[list[MovieResponse]])
def get_movies(
    db: DB,
    search: str | None = Query(default=None, max_length=100),
    genre: str | None = Query(default=None, max_length=100),
    age_rating: str | None = Query(default=None, max_length=10),
    is_active: bool | None = True,
    sort: Literal["id", "-id", "title", "-title"] = "id",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    movies, meta = get_movies_service(db, search, genre, age_rating, is_active, sort, page, page_size)
    return {"message": "Movies retrieved", "data": movies, "meta": meta}


@router.get("/{movie_id}", response_model=APIResponse[MovieResponse])
def get_movie(movie_id: int, db: DB):
    movie = get_movie_by_id_service(db, movie_id)
    return {"message": "Movie retrieved", "data": movie}


@router.post("", response_model=APIResponse[MovieResponse], status_code=201)
def create_movie(data: MovieCreate, db: DB, user: StaffUser):
    movie = create_movie_service(db, data)
    return {"message": "Movie created", "data": movie}


@router.patch("/{movie_id}", response_model=APIResponse[MovieResponse])
def update_movie(movie_id: int, data: MovieUpdate, db: DB, user: StaffUser):
    movie = update_movie_service(db, movie_id, data)
    return {"message": "Movie updated", "data": movie}


@router.delete("/{movie_id}", response_model=APIResponse[MovieResponse])
def deactivate_movie(movie_id: int, db: DB, user: StaffUser):
    movie = deactivate_movie_service(db, movie_id)
    return {"message": "Movie deactivated", "data": movie}
