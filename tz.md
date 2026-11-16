# CinemaBooking — шарҳи ҳамаи API (запрос аз куҷо ба куҷо меравад)

Ин файл нишон медиҳад, ки ҳар як API кадом файлро аз аввал то охир мегузарад, кадом функсия кадомашро даъват мекунад, чӣ аз куҷо import шудааст ва барои чӣ ҳар як параметр лозим аст.

---

## 0. Схемаи умумӣ (ҳамаи API-ҳо ҳамин тавр кор мекунанд)

```
Client (Swagger / frontend)
   │  HTTP запрос:  POST /api/v1/movies
   ▼
app/main.py               — router-ҳоро бо prefix "/api/v1" пайваст мекунад
   ▼
app/api/<name>.py         — endpoint (роут). Параметрҳоро қабул мекунад, Depends-ҳоро иҷро мекунад
   │   ├─ app/schemas/...       — Pydantic: body-ро месанҷад (валидатсия)
   │   ├─ app/auth/dependencies — DB (сессия), CurrentUser (корбар аз токен)
   │   └─ app/auth/permissions  — StaffUser / AdminUser (санҷиши роль)
   ▼
app/services/<name>.py    — бизнес-логика: санҷишҳо, хатоҳо (HTTPException)
   ▼
app/repositories/<name>.py — танҳо кор бо база (select / insert / update)
   ▼
app/models/<name>.py      — ҷадвалҳои SQLAlchemy
   ▼
PostgreSQL
```

Ҷавоб баръакс бармегардад: repository → service → api → `response_model` (`APIResponse[...]`) → client.

**Қоида:** api база намедонад, repository HTTP намедонад. Ҳамаи `HTTPException`-ҳо дар **service** ҳастанд.

---

## 1. Қисмҳои умумӣ (дар ҳама API такрор мешаванд — як бор фаҳмед)

### 1.1 `app/main.py`

| Сатр | Чӣ мекунад |
|---|---|
| 16–22 | ҳамаи `router`-ҳоро аз `app/api/*.py` import мекунад |
| 55–57 | `app.include_router(router, prefix="/api/v1", responses=ERROR_RESPONSES)` — бинобар ин ҳама URL бо `/api/v1` сар мешавад |
| 38–44 | `http_exception_handler` — ҳар `HTTPException`-е, ки дар service `raise` шуд, ба формати `{"success": false, "message": ..., "data": null}` табдил медиҳад |
| 47–52 | `validation_exception_handler` — агар Pydantic body-ро қабул накунад → 422 `"Validation error"` |
| 25–30 | `lifespan` — ҳангоми старт ҷадвалҳоро месозад (`create_all`) ва `create_first_admin_service`-ро даъват мекунад |

### 1.2 `DB` — сессияи база

```python
# app/db/database.py
def get_db():
    with SessionLocal() as session:
        yield session

# app/auth/dependencies.py:14
DB = Annotated[Session, Depends(get_db)]
```

- Дар endpoint `db: DB` навиштан = FastAPI худаш `get_db()`-ро даъват мекунад ва сессия медиҳад.
- **Барои чӣ `db` ба ҳар функсия дода мешавад?** Service ва repository худашон сессия намесозанд. Як сессия аз api то repository мегузарад → ҳамаи амалҳо дар як транзаксия ҳастанд ва баъди запрос сессия худкор баста мешавад.

### 1.3 `CurrentUser` — корбари login-шуда

```python
# app/auth/dependencies.py
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")   # header-и Authorization: Bearer <token>-ро мегирад

def get_current_user(token = Depends(oauth2_scheme), db: DB) -> User:
    payload = decode_access_token(token)     # app/auth/security.py — JWT-ро бо SECRET_KEY месанҷад
    user_id = int(payload["sub"])            # дар "sub" id-и корбар аст
    user = db.get(User, user_id)
    # токен нодуруст / корбар нест → 401;  is_active=False → 403
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]
```

- `current_user: CurrentUser` дар endpoint = "ин API токен талаб мекунад", ва объекти `User`-и тайёр меояд.

### 1.4 `StaffUser` / `AdminUser` — санҷиши роль

```python
# app/auth/permissions.py
def require_roles(*roles):
    def checker(user: CurrentUser) -> User:      # аввал CurrentUser (токен) кор мекунад
        if user.role not in roles: raise 403 "Not enough permissions"
        return user
    return checker

AdminUser = Annotated[User, Depends(require_roles(UserRole.ADMIN))]
StaffUser = Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.CINEMA_MANAGER))]

def is_staff(user) -> bool   # барои санҷиш дар дохили service (на Depends)
```

- **Барои чӣ дар `create_movie(data, db, user: StaffUser)` параметри `user` ҳаст, вале дар функсия истифода намешавад?** Худи эълон кардани параметр FastAPI-ро маҷбур мекунад, ки санҷиши ролро иҷро кунад. Агар `user: StaffUser`-ро нест кунед, ҳар кас (ҳатто бе токен) филм сохта метавонад.

### 1.5 `APIResponse` ва `PaginationMeta` — `app/schemas/response.py`

```python
class APIResponse(BaseModel, Generic[T]):
    success: bool = True
    message: str = "OK"
    data: T | None = None
    meta: PaginationMeta | None = None
```

- Endpoint `{"message": ..., "data": obj}` бармегардонад, `response_model=APIResponse[MovieResponse]` онро ба JSON табдил медиҳад. `MovieResponse` дорои `from_attributes=True` аст → объекти SQLAlchemy-ро мустақим хонда метавонад.
- `PaginationMeta.create(total, page, page_size)` → `{total, page, page_size, total_pages}`. Дар ҳамаи рӯйхатҳо (`GET` бо `page`) истифода мешавад.

### 1.6 Намунаи умумии repository

```python
def create_X(db, data: dict):
    obj = X(**data)      # dict → объекти модел
    db.add(obj)
    db.commit()          # ба база навиштан
    db.refresh(obj)      # id ва default-ҳоро аз база гирифтан
    return obj

def update_X(db, obj, data: dict):
    for key, value in data.items():
        setattr(obj, key, value)   # танҳо майдонҳои омада иваз мешаванд
    db.commit(); db.refresh(obj); return obj
```

- `data.model_dump()` — Pydantic объект → `dict`.
- `model_dump(exclude_unset=True)` — танҳо майдонҳое, ки client воқеан фиристод (барои PATCH). Бе ин, майдонҳои нафиристода ҳамчун `None` навишта мешуданд.
- `exclude_none=True` — майдонҳои `null`-ро ҳам партофтан.

### 1.7 Ҷадвали ролҳо

| Роль | Метавонад |
|---|---|
| `customer` | қайд шудан, билет харидан, билетҳои худро дидан/бекор кардан |
| `cinema_manager` | + филм, толор, ҷой, сеанс сохтан/иваз кардан, ҳамаи билетҳоро дидан |
| `admin` | + рӯйхати корбарон, иваз кардани роль, бекор кардани билети ҳар кас |

---

## 2. AUTH — `app/api/auth.py`

### 2.1 `POST /api/v1/auth/register` — қайд шудан

**Кӣ:** ҳар кас (бе токен).

**Занҷир:**

1. **`app/api/auth.py:17` → `register(data: RegisterRequest, db: DB)`**
   - `data: RegisterRequest` (`app/schemas/auth.py`) — body: `full_name` (2–150), `email` (EmailStr), `password` (8–128). Агар нодуруст → 422, ба service ҳам намерасад.
   - `db: DB` — сессия.
   - Даъват: `register_user_service(db, data)` (import аз `..services.users`).
2. **`app/services/users.py:15` → `register_user_service(db, data)`**
   - `get_user_by_email(db, data.email)` (import аз `..repositories.users`) — агар email ҳаст → **409** `"Email already registered"`.
   - `hash_password(data.password)` (import аз `..auth.security`) — паролро бо Argon2 hash мекунад; пароли кушода ҳеҷ гоҳ дар база нигоҳ дошта намешавад.
   - `"role": UserRole.CUSTOMER` — роль аз client гирифта намешавад (вагарна ҳар кас худро admin мекард).
   - `create_user(db, {...})` — `IntegrityError` (агар ду запрос якбора ҳамон email-ро фиристад) → `rollback` → 409.
3. **`app/repositories/users.py:35` → `create_user(db, data)`** — `User(**data)`, `add`, `commit`, `refresh`.
4. **Модел:** `app/models/user.py` — `User` (ҷадвали `users`, `email` unique).

**Ҷавоб:** 201, `APIResponse[UserResponse]` (пароль/hash дар ҷавоб нест, чунки `UserResponse` онро надорад).

### 2.2 `POST /api/v1/auth/login` — гирифтани токен

**Кӣ:** ҳар кас.

1. **`app/api/auth.py:23` → `login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB)`**
   - `form` — на JSON, балки **form-data**: `username` ва `password`. Ин барои он лозим аст, ки тугмаи **Authorize** дар Swagger кор кунад. Дар `username` email навишта мешавад.
   - Даъват: `login_user_service(db, form.username, form.password)`.
2. **`app/services/users.py:32` → `login_user_service(db, email, password)`**
   - `get_user_by_email(db, email)` — корбарро меёбад (`email.lower()` дар repository).
   - `verify_password(password, user.password_hash)` (аз `..auth.security`) — паролро бо hash муқоиса мекунад.
   - Корбар нест **ё** пароль хато → **401** `"Incorrect email or password"` (як хел паём, то маълум нашавад, ки email ҳаст ё не).
   - `is_active=False` → **403**.
   - `create_access_token(user.id)` (аз `..auth.security`) — JWT бо `sub=user_id`, `exp=ҳозир+ACCESS_TOKEN_EXPIRE_MINUTES`.
3. **`app/repositories/users.py:11` → `get_user_by_email`**.

**Ҷавоб:** `TokenResponse` → `{"access_token": "...", "token_type": "bearer"}` (бе `APIResponse`, чунки Swagger ҳамин форматро интизор аст).

---

## 3. USERS — `app/api/users.py`

### 3.1 `GET /api/v1/users/me` — профили худ

1. **`app/api/users.py:15` → `read_me(current_user: CurrentUser)`**
   - Service ва repository нест! `get_current_user` (§1.3) аллакай корбарро аз база гирифт, ҳамонро бармегардонем.
   - `db` ҳам лозим нест, чунки ҳеҷ чиз аз база намехонем.

### 3.2 `PATCH /api/v1/users/me` — иваз кардани профили худ

1. **`app/api/users.py:20` → `update_me(data: UserUpdate, db: DB, current_user: CurrentUser)`**
   - `data: UserUpdate` (`app/schemas/user.py`) — ҳама майдонҳо ихтиёрӣ: `full_name`, `email`, `password`. **`role` нест** → корбар ролашро худаш иваз карда наметавонад.
   - `current_user` — кадом корбарро иваз кунем. Id аз URL гирифта намешавад, балки аз токен → касе профили дигаронро иваз карда наметавонад.
   - Даъват: `update_me_service(db, current_user, data)`.
2. **`app/services/users.py:46` → `update_me_service(db, user, data)`**
   - `values = data.model_dump(exclude_unset=True, exclude_none=True)` — танҳо майдонҳои фиристодашуда.
   - Агар `email` ҳаст: `.lower()`, `get_user_by_email` — агар дигар корбар дорад → **409**.
   - Агар `password` ҳаст: `hash_password(...)` ва ба `password_hash` мегузорад (`password` аз `values` хориҷ мешавад, чунки дар модел чунин сутун нест).
   - `update_user(db, user, values)`; `IntegrityError` → 409.
3. **`app/repositories/users.py:43` → `update_user`** — `setattr` барои ҳар майдон.

### 3.3 `GET /api/v1/users` — рӯйхати корбарон

**Кӣ:** танҳо `admin`.

1. **`app/api/users.py:26` → `list_users(db, admin: AdminUser, search, role, is_active, page, page_size)`**
   - `admin: AdminUser` — санҷиши роль (§1.4).
   - `search: str | None` (max 100) — ҷустуҷӯ дар ном ва email.
   - `role: UserRoleType | None` — филтр: `admin` / `cinema_manager` / `customer` (Literal → дигар қимат 422).
   - `is_active: bool | None` — филтр.
   - `page` (≥1), `page_size` (1–100) — пагинатсия; `le=100` нагузорад, ки касе 1 000 000 сатрро якбора талаб кунад.
   - Даъват: `get_users_service(db, search, role, is_active, page, page_size)`.
2. **`app/services/users.py:64`** — `get_users(...)` → `(users, total)`, баъд `PaginationMeta.create(total, page, page_size)` (аз `..schemas.response`).
3. **`app/repositories/users.py:17` → `get_users`**
   - `ilike(f"%{search}%")` — ҷустуҷӯ бе фарқи ҳарфи калон/хурд, `or_` — ё дар `full_name`, ё дар `email`.
   - `total` — `count()` аз subquery (пеш аз `offset/limit`), то `total_pages` дуруст ҳисоб шавад.
   - `offset((page - 1) * page_size).limit(page_size)` — саҳифаи лозимӣ.

### 3.4 `PATCH /api/v1/users/{user_id}/role` — иваз кардани роль

**Кӣ:** танҳо `admin`.

1. **`app/api/users.py:40` → `change_role(user_id: int, data: UserRoleUpdate, db: DB, admin: AdminUser)`**
   - `user_id` — аз URL: роли кадом корбар.
   - `data.role` — роли нав (`UserRoleType`).
   - `admin` — ҳам санҷиши роль, ҳам ба service дода мешавад (барои санҷиши "худи худ").
2. **`app/services/users.py:69` → `change_role_service(db, admin, user_id, data)`**
   - `get_user_by_id` — нест → **404**.
   - `user.id == admin.id` → **400** `"You cannot change your own role"` (то admin тасодуфан худро аз admin маҳрум накунад ва система бе admin намонад).
   - `update_user(db, user, {"role": data.role})`.

---

## 4. MOVIES — `app/api/movies.py`

Import-ҳои файл:
- `MovieCreate, MovieUpdate, MovieResponse` ← `app/schemas/movie.py`
- `APIResponse` ← `app/schemas/response.py`
- `DB` ← `app/auth/dependencies.py`
- `StaffUser` ← `app/auth/permissions.py`
- ҳамаи `*_service` ← `app/services/movies.py`

`app/services/movies.py` ҳам import мекунад: `get_movies, get_movie_by_id, create_movie, update_movie` ← `app/repositories/movies.py`, ва `PaginationMeta` ← `app/schemas/response.py`.

### 4.1 `GET /api/v1/movies` — рӯйхати филмҳо

**Кӣ:** ҳар кас.

1. **`app/api/movies.py:17` → `get_movies(db, search, genre, age_rating, is_active=True, sort="id", page=1, page_size=20)`**
   - `search` — ҷустуҷӯ дар `title`.
   - `genre` — филтр аз рӯи жанр.
   - `age_rating` — филтр: `"12+"`, `"18+"`.
   - `is_active=True` — бо default танҳо филмҳои фаъол нишон дода мешаванд (deactivate-шудаҳо пинҳон).
   - `sort: Literal["id", "-id", "title", "-title"]` — `-` = баръакс. Literal нагузорад, ки қимати дигар ояд.
   - `page`, `page_size` — пагинатсия.
   - Даъват: `get_movies_service(db, search, genre, age_rating, is_active, sort, page, page_size)` → `(movies, meta)`.
2. **`app/services/movies.py:9`** — `get_movies(...)` → `(movies, total)`, `PaginationMeta.create(...)`.
3. **`app/repositories/movies.py:16` → `get_movies`**
   - `Movie.title.ilike(...)` — ҷустуҷӯ.
   - `func.lower(Movie.genre) == genre.lower()` — `Drama` ва `drama` як хел.
   - `SORT_FIELDS[sort]` — луғат: сатри client → сутуни SQLAlchemy. Матни client ҳеҷ гоҳ мустақим ба SQL намеравад (SQL injection нест).
   - `order_by(SORT_FIELDS[sort], Movie.id)` — `Movie.id` дуюм, то тартиб устувор бошад (агар `title`-ҳо як хел бошанд).

**Ҷавоб:** `{"message", "data": [...], "meta": {...}}`.

### 4.2 `GET /api/v1/movies/{movie_id}` — як филм

1. **`app/api/movies.py:32` → `get_movie(movie_id: int, db: DB)`** — `movie_id` аз URL.
2. **`app/services/movies.py:15` → `get_movie_by_id_service(db, movie_id)`** — `None` → **404** `"Movie not found"`.
3. **`app/repositories/movies.py:35` → `get_movie_by_id`** → `db.get(Movie, movie_id)` (ҷустуҷӯ аз рӯи primary key).

### 4.3 `POST /api/v1/movies` — сохтани филм

**Кӣ:** `admin`, `cinema_manager`.

1. **`app/api/movies.py:38` → `create_movie(data: MovieCreate, db: DB, user: StaffUser)`**
   - `data: MovieCreate` (`app/schemas/movie.py`):
     - `title` (1–255) — ҳатмӣ.
     - `description` — ихтиёрӣ.
     - `duration_minutes` (`gt=0`) — **хеле муҳим**: баъдтар ҳангоми сохтани сеанс `ends_at = starts_at + duration_minutes` аз ҳамин ҳисоб мешавад (§7.4).
     - `genre` (≤100) — ихтиёрӣ.
     - `age_rating` — бо `pattern=r"^\d{1,2}\+$"`: танҳо `"0+"`, `"12+"`, `"18+"`… `"abc"` → 422.
   - `user: StaffUser` — танҳо санҷиши роль (§1.4).
   - Даъват: `create_movie_service(db, data)`.
2. **`app/services/movies.py:22` → `create_movie_service(db, data)`**
   - Санҷиши иловагӣ лозим нест (Pydantic ҳамаашро санҷид), бинобар ин мустақим: `create_movie(db, data.model_dump())`.
   - `model_dump()` — Pydantic → dict, чунки repository `dict` қабул мекунад, на schema (repository набояд schema-ҳоро донад).
3. **`app/repositories/movies.py:39` → `create_movie(db, data)`** — `Movie(**data)`, `add`, `commit`, `refresh`.
4. **Модел `app/models/movie.py`:** `is_active` default `True` → дар body фиристодан лозим нест. `CheckConstraint("duration_minutes > 0")` — ҳимояи дуюм дар сатҳи база.

**Ҷавоб:** 201, `APIResponse[MovieResponse]`.

### 4.4 `PATCH /api/v1/movies/{movie_id}` — иваз кардани филм

**Кӣ:** staff.

1. **`app/api/movies.py:44` → `update_movie(movie_id, data: MovieUpdate, db, user: StaffUser)`**
   - `MovieUpdate` — ҳамон майдонҳо, вале ҳама ихтиёрӣ, + `is_active` (филмро дубора фаъол кардан мумкин).
2. **`app/services/movies.py:26` → `update_movie_service(db, movie_id, data)`**
   - `get_movie_by_id_service(db, movie_id)` — функсияи service-и **ҳамин файл**; агар нест → 404 (код такрор намешавад).
   - `update_movie(db, movie, data.model_dump(exclude_unset=True))` — танҳо майдонҳои фиристодашуда.
3. **`app/repositories/movies.py:47` → `update_movie`** — `setattr`.

### 4.5 `DELETE /api/v1/movies/{movie_id}` — deactivate

**Кӣ:** staff.

1. **`app/api/movies.py:50` → `deactivate_movie(movie_id, db, user: StaffUser)`**
2. **`app/services/movies.py:31` → `deactivate_movie_service`**
   - `get_movie_by_id_service` → 404.
   - `update_movie(db, movie, {"is_active": False})` — **soft delete**: аз база нест намекунем, чунки сеансҳо ва билетҳо ба филм `ForeignKey(..., ondelete="RESTRICT")` доранд — таърих бояд боқӣ монад.
3. Натиҷа: филм дар рӯйхат (`is_active=True` default) намоён намешавад ва барои он сеанси нав сохтан мумкин нест (`"Movie is not active"`, §7.4).

---

## 5. CINEMA HALLS — `app/api/cinema_halls.py`

Import-ҳо: schemas ← `app/schemas/cinema_hall.py`; services ← `app/services/cinema_halls.py`; service import мекунад аз `app/repositories/cinema_halls.py`: `get_halls, get_hall_by_id, get_hall_for_update, count_hall_seats, create_hall, update_hall`.

### 5.1 `GET /api/v1/halls`

1. **`app/api/cinema_halls.py:14` → `get_halls(db, is_active: bool | None = None)`** — `is_active` филтр (default ҳама).
2. **`app/services/cinema_halls.py:10`** → `get_halls(db, is_active)` (бе пагинатсия, толорҳо кам ҳастанд).
3. **`app/repositories/cinema_halls.py:8`** — `select(CinemaHall)`, `order_by(id)`.

### 5.2 `GET /api/v1/halls/{hall_id}`

1. **`app/api/cinema_halls.py:20` → `get_hall(hall_id, db)`**
2. **`app/services/cinema_halls.py:14` → `get_hall_by_id_service`** — нест → **404** `"Cinema hall not found"`.
3. **`app/repositories/cinema_halls.py:15` → `get_hall_by_id`** — `db.get`.

### 5.3 `POST /api/v1/halls` — сохтани толор

**Кӣ:** staff.

1. **`app/api/cinema_halls.py:26` → `create_hall(data: CinemaHallCreate, db, user: StaffUser)`**
   - `name` (1–100) — дар модел `unique=True`.
   - `capacity` (`gt=0`) — ҳадди ақалли ҷойҳо; баъдтар ҳангоми илова кардани ҷой санҷида мешавад (§6.2).
2. **`app/services/cinema_halls.py:21` → `create_hall_service`**
   - `create_hall(db, data.model_dump())`.
   - `IntegrityError` (номи такрорӣ, unique вайрон шуд) → `db.rollback()` → **409**. `rollback` лозим, вагарна сессия дар ҳолати хато мемонад.
3. **`app/repositories/cinema_halls.py:32` → `create_hall`**.

### 5.4 `PATCH /api/v1/halls/{hall_id}`

**Кӣ:** staff.

1. **`app/api/cinema_halls.py:32` → `update_hall(hall_id, data: CinemaHallUpdate, db, user)`** — `name`, `capacity`, `is_active` (ҳама ихтиёрӣ).
2. **`app/services/cinema_halls.py:29` → `update_hall_service`**
   - `get_hall_for_update(db, hall_id)` — на `get_hall_by_id`! `SELECT ... FOR UPDATE` сатри толорро **қулф** мекунад, то дар ҳамин вақт запроси дигар ҷой илова карда натавонад.
   - Агар `capacity` нав < `count_hall_seats(db, hall_id)` → **409** `"Capacity is less than the number of existing seats"` (толори 50-ҷойро ба 30 кам кардан мумкин нест, агар аллакай 50 ҷой сохта шуда бошад).
   - `update_hall(...)`; `IntegrityError` (ном такрор) → 409.
3. **`app/repositories/cinema_halls.py`**
   - `:19 get_hall_for_update` — `.with_for_update()`.
   - `:26 count_hall_seats` — `count(Seat.id) WHERE hall_id = ...`.
   - `:40 update_hall`.

---

## 6. SEATS — `app/api/seats.py`

Import-ҳо: schemas ← `app/schemas/seat.py`; services ← `app/services/seats.py`.
`app/services/seats.py` import мекунад:
- `get_hall_for_update, count_hall_seats` ← `app/repositories/cinema_halls.py` (**аз repository-и дигар**)
- `get_seats_by_hall, get_seat_by_id, create_seat, update_seat` ← `app/repositories/seats.py`
- `get_hall_by_id_service` ← `app/services/cinema_halls.py` (**аз service-и дигар**, то санҷиши 404 такрор нашавад)

### 6.1 `GET /api/v1/halls/{hall_id}/seats` — ҷойҳои толор

1. **`app/api/seats.py:13` → `get_hall_seats(hall_id, db)`**
2. **`app/services/seats.py:14` → `get_hall_seats_service`**
   - `get_hall_by_id_service(db, hall_id)` (аз `services/cinema_halls.py`) — агар толор нест → 404. Бе ин, барои толори вуҷуд надошта `[]` бармегашт ва client фикр мекард, ки толор холист.
   - `get_seats_by_hall(db, hall_id)`.
3. **`app/repositories/seats.py:8`** — `WHERE hall_id`, `ORDER BY row_number, seat_number`.

### 6.2 `POST /api/v1/halls/{hall_id}/seats` — илова кардани ҷой

**Кӣ:** staff.

1. **`app/api/seats.py:19` → `create_seat(hall_id, data: SeatCreate, db, user: StaffUser)`**
   - `hall_id` — аз URL (на аз body): ҷой ба кадом толор.
   - `data`: `row_number` (>0), `seat_number` (>0), `is_active` (default `True`).
2. **`app/services/seats.py:19` → `create_seat_service(db, hall_id, data)`**
   - `get_hall_for_update` (аз `repositories/cinema_halls.py`) — қулф: агар ду запрос якбора охирин ҷойро илова кунанд, `capacity` вайрон намешавад.
   - Толор нест → 404.
   - `count_hall_seats(...) >= hall.capacity` → **409** `"Hall capacity reached"`.
   - `create_seat(db, {"hall_id": hall_id, **data.model_dump()})` — `hall_id`-ро ба dict илова мекунем, чунки он дар schema нест.
   - `IntegrityError` → 409 `SEAT_EXISTS` — `UniqueConstraint("hall_id", "row_number", "seat_number")` дар `app/models/seat.py`: дар як толор "қатори 3, ҷои 5" ду бор буда наметавонад.
3. **`app/repositories/seats.py:38` → `create_seat`**.

### 6.3 `PATCH /api/v1/seats/{seat_id}`

**Кӣ:** staff.

1. **`app/api/seats.py:25` → `update_seat(seat_id, data: SeatUpdate, db, user)`** — `row_number`, `seat_number`, `is_active`. `is_active=False` — ҷой шикаста аст, фурӯхта намешавад.
2. **`app/services/seats.py:33` → `update_seat_service`** — `get_seat_by_id` → 404; `update_seat(..., exclude_unset, exclude_none)`; `IntegrityError` → 409.
3. **`app/repositories/seats.py:16, 46`**.

---

## 7. SHOWTIMES (сеансҳо) — `app/api/showtimes.py`

Import-ҳои api: `ShowtimeStatusType` ← `app/models/showtime.py`; `ShowtimeCreate, ShowtimeUpdate, ShowtimeResponse` ← `app/schemas/showtime.py`; `SeatMapResponse` ← `app/schemas/seat.py`; services ← `app/services/showtimes.py`.

`app/services/showtimes.py` import мекунад:
- `Showtime, ShowtimeStatus` ← `app/models/showtime.py`
- `get_movie_by_id` ← `app/repositories/movies.py` (**repository-и филм**)
- `get_hall_for_update` ← `app/repositories/cinema_halls.py` (**repository-и толор**)
- `get_seat_map` ← `app/repositories/seats.py` (**repository-и ҷой**)
- `get_showtimes, get_showtime_by_id, has_overlapping_showtime, count_booked_tickets, create_showtime, update_showtime, cancel_showtime` ← `app/repositories/showtimes.py`

Функсияи ёрирасон **`to_utc(value)`** (`app/services/showtimes.py:17`) — вақтро ба UTC табдил медиҳад. SQLite вақтро бе timezone бармегардонад; бе ин муқоисаи `starts_at <= now` хато медод. Ин функсияро `services/tickets.py` ҳам import мекунад.

### 7.1 `GET /api/v1/showtimes` — рӯйхати сеансҳо

1. **`app/api/showtimes.py:21` → `get_showtimes(db, movie_id, hall_id, status, day, date_from, date_to, sort, page, page_size)`**
   - `movie_id` — сеансҳои як филм.
   - `hall_id` — сеансҳои як толор.
   - `status` — `scheduled` / `cancelled` / `finished`.
   - `day: date` — "ҳамаи сеансҳои 2026-12-01". Қулай барои frontend.
   - `date_from`, `date_to` — фосилаи дилхоҳ.
   - `sort` — `starts_at` / `-starts_at`.
   - `page`, `page_size`.
2. **`app/services/showtimes.py:24` → `get_showtimes_service`**
   - Агар `day` ҳаст → `date_from = day 00:00 UTC`, `date_to = date_from + 1 рӯз`. Яъне `day` танҳо шакли кӯтоҳи `date_from/date_to` аст, repository дар бораи `day` намедонад.
   - `date_from > date_to` → **400**.
   - `get_showtimes(...)`, `PaginationMeta.create(...)`.
3. **`app/repositories/showtimes.py:16` → `get_showtimes`** — филтрҳо `starts_at >= date_from` ва `starts_at < date_to` (`<`, на `<=`, то сеанси соати 00:00-и рӯзи дигар дохил нашавад).

### 7.2 `GET /api/v1/showtimes/{showtime_id}`

1. **`app/api/showtimes.py:39` → `get_showtime(showtime_id, db)`**
2. **`app/services/showtimes.py:38` → `get_showtime_by_id_service`** — нест → 404.
3. **`app/repositories/showtimes.py:38` → `get_showtime_by_id`** — `db.get`.

### 7.3 `GET /api/v1/showtimes/{showtime_id}/seats` — харитаи ҷойҳо

**Кӣ:** ҳар кас. Frontend аз ин барои кашидани толор истифода мебарад.

1. **`app/api/showtimes.py:45` → `get_seat_map(showtime_id, db)`**
2. **`app/services/showtimes.py:118` → `get_seat_map_service`**
   - `get_showtime_by_id_service` → 404.
   - `hall = showtime.hall` — relationship аз модел, query-и алоҳида навиштан лозим нест.
   - `get_seat_map(db, hall.id, showtime.id)` (аз `repositories/seats.py`) → рӯйхати `(seat, is_booked)`.
   - Барои ҳар ҷой статус: `is_active=False` → `"unavailable"`, `is_booked` → `"booked"`, вагарна `"available"`.
   - `summary` — ҳисоби ҳар статус; `rows` — ҷойҳоро аз рӯи қатор гурӯҳ мекунад (`setdefault`).
3. **`app/repositories/seats.py:20` → `get_seat_map(db, hall_id, showtime_id)`**
   - **Як query**: ҳамаи ҷойҳои толор + `EXISTS (билети booked барои ҳамин сеанс ва ҳамин ҷой)`. Агар барои ҳар ҷой query-и алоҳида мекардем — 200 ҷой = 200 query (мушкили N+1).
   - Барои чӣ ҳам `hall_id` ва ҳам `showtime_id`? `hall_id` — кадом ҷойҳо; `showtime_id` — билетҳои кадом сеанс (дар як толор сеансҳои зиёд ҳастанд).

**Ҷавоб:** `SeatMapResponse` — `{showtime_id, hall_id, hall_name, summary, rows: [{row_number, seats: [{id, seat_number, status}]}]}`.

### 7.4 `POST /api/v1/showtimes` — сохтани сеанс (+ санҷиши пересечение)

**Кӣ:** staff.

1. **`app/api/showtimes.py:51` → `create_showtime(data: ShowtimeCreate, db, user: StaffUser)`**
   - `data: ShowtimeCreate` (`app/schemas/showtime.py`):
     - `movie_id` — кадом филм.
     - `hall_id` — дар кадом толор.
     - `starts_at: AwareDatetime` — **бояд timezone дошта бошад** (`"2026-12-01T18:00:00Z"` ё `+05:00`). Бе timezone → 422, то маълум бошад, ки соати 18:00 дар кадом минтақа аст.
     - `ticket_price` (>0, 10 рақам, 2 баъди нуқта).
     - **`ends_at` нест!** Client онро намефиристад — сервер худаш ҳисоб мекунад (то client дарозии нодуруст нагузорад).
2. **`app/services/showtimes.py:69` → `create_showtime_service(db, data)`**
   - `starts_at = to_utc(data.starts_at)` — ҳама вақтҳо дар база UTC.
   - `ends_at = _check_schedule(db, data.movie_id, data.hall_id, starts_at)`.
   - `create_showtime(db, {movie_id, hall_id, starts_at, ends_at, ticket_price})` — `status` дода намешавад, default `scheduled` аз модел.
3. **`app/services/showtimes.py:45` → `_check_schedule(db, movie_id, hall_id, starts_at, exclude_id=None)`** — ҳамаи санҷишҳо:
   - `get_movie_by_id` (аз `repositories/movies.py`) — нест → 404; `is_active=False` → **400** `"Movie is not active"`.
   - `get_hall_for_update` (аз `repositories/cinema_halls.py`) — нест → 404; `is_active=False` → 400. **Қулф** — ду менеҷер якбора дар як толор ду сеанси якдигарро буранда сохта наметавонанд.
   - `starts_at <= now` → **400** `"Showtime must start in the future"`.
   - `ends_at = starts_at + timedelta(minutes=movie.duration_minutes)` — барои ҳамин `duration_minutes` дар филм ҳатмӣ аст.
   - `has_overlapping_showtime(db, hall_id, starts_at, ends_at, exclude_id)` → `True` → **409** `"Showtime overlaps with another showtime in this hall"`.
   - `ends_at`-ро бармегардонад.
   - **Барои чӣ `exclude_id`?** Ҳангоми create `None` аст. Ҳангоми update (§7.5) id-и худи сеанс дода мешавад, вагарна сеанс бо худаш "пересечение" медод.
4. **`app/repositories/showtimes.py:42` → `has_overlapping_showtime(db, hall_id, starts_at, ends_at, exclude_id)`**
   ```python
   Showtime.hall_id == hall_id,                     # танҳо ҳамин толор
   Showtime.status != ShowtimeStatus.CANCELLED,     # сеансҳои бекоршуда халал намерасонанд
   Showtime.starts_at < ends_at,                    # кӯҳна пеш аз охири нав сар мешавад
   Showtime.ends_at > starts_at,                    # ва баъд аз сари нав тамом мешавад
   ```
   Ду фосила [A1, A2) ва [B1, B2) мебуранд, агар `A1 < B2 AND A2 > B1`. Масалан: кӯҳна 18:00–20:00, нав 19:30–21:30 → `18:00 < 21:30` ✓ ва `20:00 > 19:30` ✓ → пересечение. Нав 20:00–22:00 → `20:00 > 20:00` ✗ → мумкин (паи ҳам).
   `select(query.exists())` — танҳо `True/False`, сатрҳоро намехонад.
5. **`app/repositories/showtimes.py:65` → `create_showtime`**.
6. **Модел `app/models/showtime.py`:** `CheckConstraint("ends_at > starts_at")`, `ticket_price > 0`; индекс `(hall_id, starts_at)` — барои тез кор кардани санҷиши пересечение.

### 7.5 `PATCH /api/v1/showtimes/{showtime_id}`

**Кӣ:** staff.

1. **`app/api/showtimes.py:57` → `update_showtime(showtime_id, data: ShowtimeUpdate, db, user)`**
   - `ShowtimeUpdate`: `movie_id`, `hall_id`, `starts_at`, `ticket_price`, `status` — ҳама ихтиёрӣ.
2. **`app/services/showtimes.py:82` → `update_showtime_service`**
   - `get_showtime_by_id_service` → 404.
   - `status != scheduled` → **409** `"Only scheduled showtimes can be changed"` (сеанси бекоршуда/тамомшударо иваз кардан маъно надорад).
   - `values = model_dump(exclude_unset, exclude_none)`; `new_status = values.pop("status")` — статус алоҳида коркард мешавад.
   - Агар `movie_id`, `hall_id` ё `starts_at` иваз шавад (вақт/дарозӣ/толор дигар мешавад):
     - Толор иваз мешавад **ва** `count_booked_tickets(...) > 0` → **409** (билетҳо ба ҷойҳои толори кӯҳна баста шудаанд).
     - Қиматҳои нав ё кӯҳна (`values.get("x", showtime.x)`) гирифта мешаванд, `_check_schedule(..., exclude_id=showtime.id)` — ҳамон санҷишҳои §7.4, `ends_at` аз нав ҳисоб мешавад.
   - `new_status == finished` → ба `values` илова.
   - `update_showtime(db, showtime, values)`.
   - `new_status == cancelled` → `cancel_showtime(db, showtime)` — ҳамон логикаи §7.6 (билетҳо ҳам бекор мешаванд).
3. **`app/repositories/showtimes.py`** — `:56 count_booked_tickets`, `:73 update_showtime`, `:81 cancel_showtime`.

### 7.6 `DELETE /api/v1/showtimes/{showtime_id}` — бекор кардани сеанс

**Кӣ:** staff.

1. **`app/api/showtimes.py:63` → `cancel_showtime(showtime_id, db, user)`**
2. **`app/services/showtimes.py:111` → `cancel_showtime_service`** — 404; `status != scheduled` → 409.
3. **`app/repositories/showtimes.py:81` → `cancel_showtime(db, showtime)`**
   - `showtime.status = CANCELLED`.
   - `UPDATE tickets SET status='cancelled', cancelled_at=now WHERE showtime_id=... AND status='booked'` — ҳамаи билетҳо бо як query.
   - Як `commit` → ё ҳама бекор мешаванд, ё ҳеҷ чиз (транзаксия). Сатрҳо нест карда намешаванд — таърих мемонад.

---

## 8. TICKETS — `app/api/tickets.py`

Import-ҳои api: `TicketStatusType` ← `app/models/ticket.py`; `TicketCreate, TicketResponse` ← `app/schemas/ticket.py`; `DB, CurrentUser` ← `app/auth/dependencies.py`; `StaffUser` ← `app/auth/permissions.py`; services ← `app/services/tickets.py`.

`app/services/tickets.py` import мекунад:
- `User, UserRole` ← `app/models/user.py`
- `ShowtimeStatus` ← `app/models/showtime.py`
- `TicketStatus` ← `app/models/ticket.py`
- `get_seat_by_id` ← `app/repositories/seats.py`
- `get_showtime_by_id` ← `app/repositories/showtimes.py`
- `get_tickets, get_ticket_by_id, is_seat_booked, create_ticket, cancel_ticket` ← `app/repositories/tickets.py`
- `is_staff` ← `app/auth/permissions.py`
- `to_utc` ← `app/services/showtimes.py` (**аз service-и дигар**)

### 8.1 `POST /api/v1/tickets` — харидани билет

**Кӣ:** ҳар корбари login-шуда.

1. **`app/api/tickets.py:20` → `book_ticket(data: TicketCreate, db, current_user: CurrentUser)`**
   - `data`: `showtime_id`, `seat_id`. **`user_id` ва `price` нест** — client онҳоро интихоб карда наметавонад.
   - `current_user` — соҳиби билет (аз токен).
   - Даъват: `book_ticket_service(db, current_user, data)`.
2. **`app/services/tickets.py:23` → `book_ticket_service(db, user, data)`** — санҷишҳо бо тартиб:
   - `get_showtime_by_id` (аз `repositories/showtimes.py`) → 404 `"Showtime not found"`.
   - `get_seat_by_id` (аз `repositories/seats.py`) → 404 `"Seat not found"`.
   - `seat.hall_id != showtime.hall_id` → **422** — ҷой аз толори дигар аст.
   - `showtime.status != scheduled` → **409** `"Showtime is cancelled"` / `finished`.
   - `to_utc(showtime.starts_at) <= now` → **409** `"Showtime has already started"`.
   - `not seat.is_active` → **409** `"Seat is not available"`.
   - `is_seat_booked(db, showtime.id, seat.id)` → **409** `"Seat already booked"` — "роҳи тез", то ба база навиштан кӯшиш накунем.
   - `create_ticket(db, {...})`:
     - `"user_id": user.id` — ҳамеша аз JWT.
     - `"price": showtime.ticket_price` — нарх дар лаҳзаи харид сабт мешавад; агар баъдтар нархи сеанс иваз шавад, билети харидашуда тағйир намеёбад.
     - `"status": BOOKED`.
   - `IntegrityError` → `rollback` → **409** — агар ду нафар **якбора** як ҷойро харанд, ҳарду аз `is_seat_booked` мегузаранд, вале база танҳо якеро қабул мекунад.
3. **`app/repositories/tickets.py`** — `:36 is_seat_booked` (`EXISTS`), `:48 create_ticket`.
4. **Модел `app/models/ticket.py`:** индекси `uq_tickets_showtime_seat_booked` — `UNIQUE(showtime_id, seat_id) WHERE status='booked'`. Ин кафолати асосист: дар як сеанс як ҷой танҳо як билети фаъол дорад; билети бекоршуда халал намерасонад → ҷойро дубора фурӯхтан мумкин.

### 8.2 `GET /api/v1/tickets/my` — билетҳои ман

**Кӣ:** ҳар корбари login-шуда.

1. **`app/api/tickets.py:26` → `get_my_tickets(db, current_user, status, showtime_id, sort="-booked_at", page, page_size)`**
   - `status` — `booked` / `cancelled`.
   - `showtime_id` — билетҳои ман барои як сеанс.
   - `sort` — default аз нав ба кӯҳна.
   - **Аҳамият:** ин роут дар файл **пеш аз** `/{ticket_id}` аст, вагарна FastAPI `"my"`-ро ҳамчун `ticket_id` мехонд → 422.
2. **`app/services/tickets.py:59` → `get_my_tickets_service(db, user, ...)`** — `get_tickets(db, user.id, ...)`: `user_id` **аз токен** гузошта мешавад, то корбар танҳо билетҳои худро бинад.
3. **`app/repositories/tickets.py:15` → `get_tickets`** — филтрҳо, `SORT_FIELDS`, пагинатсия.

### 8.3 `GET /api/v1/tickets` — ҳамаи билетҳо

**Кӣ:** staff.

1. **`app/api/tickets.py:40` → `get_all_tickets(db, user: StaffUser, user_id, showtime_id, status, sort, page, page_size)`**
   - Ин ҷо `user_id` **аз query** аст — staff билетҳои ҳар корбарро дида метавонад.
2. **`app/services/tickets.py:65` → `get_all_tickets_service`** — ҳамон `get_tickets` (як функсияи repository барои ду API: `/my` ва `/`). Фарқ танҳо дар он аст, ки `user_id` аз куҷо меояд.

### 8.4 `GET /api/v1/tickets/{ticket_id}`

**Кӣ:** соҳиби билет ё staff.

1. **`app/api/tickets.py:55` → `get_ticket(ticket_id, db, current_user)`** — `CurrentUser`, на `StaffUser`, чунки customer ҳам билети худро дида метавонад.
2. **`app/services/tickets.py:71` → `get_ticket_service(db, user, ticket_id)`**
   - `get_ticket_by_id` → 404.
   - `ticket.user_id != user.id and not is_staff(user)` → **403**. Санҷиш дар service аст (на бо Depends), чунки барои донистани соҳиб аввал билетро аз база гирифтан лозим.
3. **`app/repositories/tickets.py:32`**.

### 8.5 `POST /api/v1/tickets/{ticket_id}/cancel` — бекор кардани билет

**Кӣ:** соҳиби билет ё **admin** (`cinema_manager` не).

1. **`app/api/tickets.py:61` → `cancel_ticket(ticket_id, db, current_user)`**
2. **`app/services/tickets.py:80` → `cancel_ticket_service(db, user, ticket_id)`**
   - `get_ticket_by_id` → 404.
   - `ticket.user_id != user.id and user.role != ADMIN` → **403**.
   - `status != booked` → **409** `"Ticket is already cancelled"`.
   - `to_utc(ticket.showtime.starts_at) <= now` → **409** — баъди сар шудани сеанс бекор кардан мумкин нест. `ticket.showtime` — relationship.
   - `cancel_ticket(db, ticket)`.
3. **`app/repositories/tickets.py:57` → `cancel_ticket`** — `status = cancelled`, `cancelled_at = now`. Сатр нест карда намешавад. Баъди ин индекси `WHERE status='booked'` ин ҷойро озод мешуморад → дигар кас онро харида метавонад.

---

## 9. Ҷадвали кӯтоҳи ҳамаи API

| Method | URL | Кӣ | api | service | repository |
|---|---|---|---|---|---|
| POST | `/auth/register` | ҳама | `auth.register` | `users.register_user_service` | `users.get_user_by_email`, `create_user` |
| POST | `/auth/login` | ҳама | `auth.login` | `users.login_user_service` | `users.get_user_by_email` |
| GET | `/users/me` | login | `users.read_me` | — | — |
| PATCH | `/users/me` | login | `users.update_me` | `users.update_me_service` | `users.get_user_by_email`, `update_user` |
| GET | `/users` | admin | `users.list_users` | `users.get_users_service` | `users.get_users` |
| PATCH | `/users/{id}/role` | admin | `users.change_role` | `users.change_role_service` | `users.get_user_by_id`, `update_user` |
| GET | `/movies` | ҳама | `movies.get_movies` | `movies.get_movies_service` | `movies.get_movies` |
| GET | `/movies/{id}` | ҳама | `movies.get_movie` | `movies.get_movie_by_id_service` | `movies.get_movie_by_id` |
| POST | `/movies` | staff | `movies.create_movie` | `movies.create_movie_service` | `movies.create_movie` |
| PATCH | `/movies/{id}` | staff | `movies.update_movie` | `movies.update_movie_service` | `movies.get_movie_by_id`, `update_movie` |
| DELETE | `/movies/{id}` | staff | `movies.deactivate_movie` | `movies.deactivate_movie_service` | `movies.get_movie_by_id`, `update_movie` |
| GET | `/halls` | ҳама | `cinema_halls.get_halls` | `get_halls_service` | `cinema_halls.get_halls` |
| GET | `/halls/{id}` | ҳама | `cinema_halls.get_hall` | `get_hall_by_id_service` | `cinema_halls.get_hall_by_id` |
| POST | `/halls` | staff | `cinema_halls.create_hall` | `create_hall_service` | `cinema_halls.create_hall` |
| PATCH | `/halls/{id}` | staff | `cinema_halls.update_hall` | `update_hall_service` | `get_hall_for_update`, `count_hall_seats`, `update_hall` |
| GET | `/halls/{id}/seats` | ҳама | `seats.get_hall_seats` | `get_hall_seats_service` | `seats.get_seats_by_hall` |
| POST | `/halls/{id}/seats` | staff | `seats.create_seat` | `create_seat_service` | `get_hall_for_update`, `count_hall_seats`, `create_seat` |
| PATCH | `/seats/{id}` | staff | `seats.update_seat` | `update_seat_service` | `seats.get_seat_by_id`, `update_seat` |
| GET | `/showtimes` | ҳама | `showtimes.get_showtimes` | `get_showtimes_service` | `showtimes.get_showtimes` |
| GET | `/showtimes/{id}` | ҳама | `showtimes.get_showtime` | `get_showtime_by_id_service` | `showtimes.get_showtime_by_id` |
| GET | `/showtimes/{id}/seats` | ҳама | `showtimes.get_seat_map` | `get_seat_map_service` | `seats.get_seat_map` |
| POST | `/showtimes` | staff | `showtimes.create_showtime` | `create_showtime_service` → `_check_schedule` | `movies.get_movie_by_id`, `get_hall_for_update`, `has_overlapping_showtime`, `create_showtime` |
| PATCH | `/showtimes/{id}` | staff | `showtimes.update_showtime` | `update_showtime_service` → `_check_schedule` | + `count_booked_tickets`, `update_showtime`, `cancel_showtime` |
| DELETE | `/showtimes/{id}` | staff | `showtimes.cancel_showtime` | `cancel_showtime_service` | `showtimes.cancel_showtime` |
| POST | `/tickets` | login | `tickets.book_ticket` | `book_ticket_service` | `get_showtime_by_id`, `get_seat_by_id`, `is_seat_booked`, `create_ticket` |
| GET | `/tickets/my` | login | `tickets.get_my_tickets` | `get_my_tickets_service` | `tickets.get_tickets` |
| GET | `/tickets` | staff | `tickets.get_all_tickets` | `get_all_tickets_service` | `tickets.get_tickets` |
| GET | `/tickets/{id}` | соҳиб / staff | `tickets.get_ticket` | `get_ticket_service` | `tickets.get_ticket_by_id` |
| POST | `/tickets/{id}/cancel` | соҳиб / admin | `tickets.cancel_ticket` | `cancel_ticket_service` | `get_ticket_by_id`, `cancel_ticket` |

(Ҳамаи URL-ҳо бо `/api/v1` сар мешаванд.)

---

## 10. Тартиби дуруст барои санҷиш дар Swagger (`/docs`)

1. `POST /auth/login` бо `FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD` аз `.env` → тугмаи **Authorize**.
2. `POST /movies` — филм (бо `duration_minutes`).
3. `POST /halls` — толор (бо `capacity`).
4. `POST /halls/{hall_id}/seats` — ҷойҳо.
5. `POST /showtimes` — сеанс (`starts_at` дар оянда ва бо timezone).
6. `POST /auth/register` → `login` ҳамчун customer → `POST /tickets`.
7. `GET /showtimes/{id}/seats` — ҷой акнун `booked` аст.
