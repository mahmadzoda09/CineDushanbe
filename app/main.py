from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .core.config import settings
from .db.database import Base, engine, SessionLocal
from . import models  # noqa: F401  registers all tables in Base.metadata
from .schemas.response import ERROR_RESPONSES
from .services.users import create_first_admin_service
from .api.auth import router as auth_router
from .api.users import router as users_router
from .api.movies import router as movies_router
from .api.cinema_halls import router as cinema_halls_router
from .api.seats import router as seats_router
from .api.showtimes import router as showtimes_router
from .api.tickets import router as tickets_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        create_first_admin_service(db)
    yield


app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG, lifespan=lifespan)


# All errors use the same envelope as successful responses: {success, message, data}

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": str(exc.detail), "data": None},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={"success": False, "message": "Validation error", "data": jsonable_encoder(exc.errors())},
    )


for router in (auth_router, users_router, movies_router, cinema_halls_router,
               seats_router, showtimes_router, tickets_router):
    app.include_router(router, prefix="/api/v1", responses=ERROR_RESPONSES)


@app.get("/health", tags=["Health"])
def health():
    return {"success": True, "message": f"{settings.APP_NAME} is running", "data": None}


# CineDushanbe web frontend (frontend/index.html); mounted last so API routes and /docs take priority
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
