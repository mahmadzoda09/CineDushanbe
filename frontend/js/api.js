// Thin wrapper around the CinemaBooking REST API (/api/v1)

const API_BASE = "/api/v1";
const TOKEN_KEY = "cinedushanbe_token";

const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* storage unavailable (private mode) — token lives in memory only */ }
  },
};

// Backend error messages -> Russian
const ERROR_TEXT = {
  "Cannot cancel a ticket after the showtime has started": "Нельзя отменить билет после начала сеанса",
  "Cannot change the hall of a showtime with booked tickets": "Нельзя сменить зал: на сеанс уже куплены билеты",
  "Capacity is less than the number of existing seats": "Вместимость меньше, чем количество мест в зале",
  "Cinema hall is not active": "Зал не активен",
  "Cinema hall not found": "Зал не найден",
  "Cinema hall with this name already exists": "Зал с таким названием уже существует",
  "Email already registered": "Этот email уже зарегистрирован",
  "Hall capacity reached": "Достигнута вместимость зала",
  "Inactive user": "Пользователь заблокирован",
  "Incorrect email or password": "Неверный email или пароль",
  "Invalid or expired authentication credentials": "Сессия истекла, войдите снова",
  "Movie is not active": "Фильм снят с показа",
  "Movie not found": "Фильм не найден",
  "Not enough permissions": "Недостаточно прав",
  "Only scheduled showtimes can be cancelled": "Отменить можно только запланированный сеанс",
  "Only scheduled showtimes can be changed": "Изменить можно только запланированный сеанс",
  "Seat already booked": "Место уже занято",
  "Seat does not belong to the showtime hall": "Место не относится к залу этого сеанса",
  "Seat is not available": "Место недоступно",
  "Seat not found": "Место не найдено",
  "Seat with this row and number already exists in the hall": "Такое место уже есть в зале",
  "Showtime has already started": "Сеанс уже начался",
  "Showtime must start in the future": "Сеанс должен начинаться в будущем",
  "Showtime not found": "Сеанс не найден",
  "Showtime overlaps with another showtime in this hall": "Сеанс пересекается с другим сеансом в этом зале",
  "Showtime is cancelled": "Сеанс отменён",
  "Showtime is finished": "Сеанс завершён",
  "Ticket is already cancelled": "Билет уже отменён",
  "Ticket not found": "Билет не найден",
  "User not found": "Пользователь не найден",
  "You cannot change your own role": "Нельзя изменить собственную роль",
  "date_from must be before date_to": "Дата начала должна быть раньше даты окончания",
};

const FIELD_TEXT = {
  full_name: "Имя", email: "Email", password: "Пароль", username: "Email",
  title: "Название", description: "Описание", duration_minutes: "Длительность",
  genre: "Жанр", age_rating: "Возраст", name: "Название", capacity: "Вместимость",
  starts_at: "Начало", ticket_price: "Цена", row_number: "Ряд", seat_number: "Место",
};

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function errorMessage(json, status) {
  if (json && Array.isArray(json.data) && json.data.length) {
    return json.data
      .map((e) => {
        const field = Array.isArray(e.loc) ? e.loc[e.loc.length - 1] : "";
        return `${FIELD_TEXT[field] || field}: ${e.msg}`;
      })
      .join("; ");
  }
  if (json && json.message) return ERROR_TEXT[json.message] || json.message;
  return `Ошибка сервера (${status})`;
}

const api = {
  token: storage.get(TOKEN_KEY),
  onUnauthorized: null,

  setToken(token) {
    this.token = token;
    storage.set(TOKEN_KEY, token);
  },

  async request(method, path, { params, body, form } = {}) {
    const url = new URL(API_BASE + path, location.origin);
    for (const [key, value] of Object.entries(params || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
    }

    const headers = {};
    let payload;
    if (form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      payload = new URLSearchParams(form);
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let res;
    try {
      res = await fetch(url, { method, headers, body: payload });
    } catch {
      throw new ApiError(0, "Сервер недоступен. Проверьте, что backend запущен.");
    }

    let json = null;
    try { json = await res.json(); } catch { /* empty body */ }

    if (!res.ok) {
      if (res.status === 401 && this.token) {
        this.setToken(null);
        if (this.onUnauthorized) this.onUnauthorized();
      }
      throw new ApiError(res.status, errorMessage(json, res.status));
    }
    return json;
  },

  get(path, params) { return this.request("GET", path, { params }); },
  post(path, body) { return this.request("POST", path, { body }); },
  patch(path, body) { return this.request("PATCH", path, { body }); },
  del(path) { return this.request("DELETE", path); },

  // Walks through every page of a paginated list endpoint
  async getAll(path, params = {}) {
    const items = [];
    for (let page = 1; ; page++) {
      const res = await this.get(path, { ...params, page, page_size: 100 });
      items.push(...res.data);
      if (!res.meta || page >= res.meta.total_pages) return items;
    }
  },

  // OAuth2 form: the "username" field holds the email
  login(email, password) {
    return this.request("POST", "/auth/login", { form: { username: email, password } });
  },
};
