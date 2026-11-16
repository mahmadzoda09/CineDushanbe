// CineDushanbe — single-page frontend for the CinemaBooking API (hash router, no build step)

const CURRENCY = "TJS";
const MAX_SEATS_PER_ORDER = 10;

// Shown on the «О кинотеатре» page — replace with the real cinema details
const CINEMA_INFO = {
  address: "г. Душанбе, проспект Рудаки",
  phone: "+992 00 000 00 00",
  email: "info@cinedushanbe.tj",
  hours: [
    ["Понедельник – пятница", "10:00 – 01:00"],
    ["Суббота – воскресенье", "09:00 – 02:00"],
  ],
  socials: [
    ["Instagram", "https://instagram.com/"],
    ["Telegram", "https://t.me/"],
  ],
};

const ROLE_TEXT = { admin: "Администратор", cinema_manager: "Менеджер", customer: "Зритель" };
const SHOWTIME_STATUS_TEXT = { scheduled: "Запланирован", cancelled: "Отменён", finished: "Завершён" };
const TICKET_STATUS_TEXT = { booked: "Активен", cancelled: "Отменён" };

const state = { user: null };
const $app = document.getElementById("app");
const $nav = document.getElementById("nav");

/* ---------------- helpers ---------------- */

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

const fmt = {
  day: (d) => new Date(d).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
  shortDay: (d) => new Date(d).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }),
  time: (d) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
  dateTime: (d) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  price: (p) => `${Number(p).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCY}`,
  duration: (m) => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60 ? `${m % 60} мин` : ""}`.trim() : `${m} мин`),
};

const nowIso = () => new Date().toISOString();
const isStaff = () => state.user && (state.user.role === "admin" || state.user.role === "cinema_manager");
const isAdmin = () => state.user && state.user.role === "admin";
const go = (path) => { location.hash = path; };

// "2026-12-01T18:00" for <input type="datetime-local"> in the viewer's timezone
function toLocalInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Movies have no images in the API, so posters are generated from the title
function poster(movie, extraClass = "") {
  const h = hue(movie.title);
  const style = `background: radial-gradient(circle at 30% 20%, hsl(${h} 80% 60% / .55), transparent 55%), linear-gradient(160deg, hsl(${h} 60% 32%), hsl(${(h + 50) % 360} 65% 12%))`;
  return `
    <div class="poster ${extraClass}" style="${style}">
      <span class="poster-letter">${esc(movie.title.trim()[0] || "?")}</span>
      <span class="poster-title">${esc(movie.title)}</span>
      ${movie.age_rating ? `<span class="age-badge">${esc(movie.age_rating)}</span>` : ""}
    </div>`;
}

function badge(text, kind) {
  return `<span class="badge badge-${kind}">${esc(text)}</span>`;
}

function toast(message, type = "info") {
  const node = el(`<div class="toast toast-${type}">${esc(message)}</div>`);
  document.getElementById("toasts").append(node);
  setTimeout(() => node.classList.add("hide"), 3800);
  setTimeout(() => node.remove(), 4200);
}

function emptyState(title, text = "", action = "") {
  return `<div class="empty"><div class="empty-icon">🎬</div><h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ""}${action}</div>`;
}

async function hallsMap() {
  const halls = await api.getAll("/halls");
  return new Map(halls.map((h) => [h.id, h]));
}

/* ---------------- modal & forms ---------------- */

function openModal({ title, content, wide = false, onClose }) {
  const overlay = el(`
    <div class="modal-overlay">
      <div class="modal ${wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head">
          <h3>${esc(title)}</h3>
          <button class="icon-btn" data-close aria-label="Закрыть">✕</button>
        </div>
        <div class="modal-body"></div>
      </div>
    </div>`);
  const body = overlay.querySelector(".modal-body");
  if (typeof content === "string") body.innerHTML = content;
  else if (content) body.append(content);

  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (onClose) onClose();
  }
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.append(overlay);
  return { body, close };
}

function confirmDialog(text, { okLabel = "Подтвердить", danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const modal = openModal({
      title: "Подтверждение",
      content: `
        <p>${esc(text)}</p>
        <div class="form-actions">
          <button class="btn btn-ghost" data-close>Отмена</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-ok>${esc(okLabel)}</button>
        </div>`,
      onClose: () => { if (!answered) resolve(false); },
    });
    modal.body.querySelector("[data-ok]").addEventListener("click", () => {
      answered = true;
      modal.close();
      resolve(true);
    });
  });
}

function fieldHtml(f) {
  const id = `f-${f.name}`;
  const req = f.required ? "required" : "";
  const value = f.value ?? "";
  let input;
  if (f.type === "textarea") {
    input = `<textarea id="${id}" name="${f.name}" rows="4" ${req} placeholder="${esc(f.placeholder || "")}">${esc(value)}</textarea>`;
  } else if (f.type === "select") {
    input = `<select id="${id}" name="${f.name}" ${req}>
      ${f.placeholder ? `<option value="">${esc(f.placeholder)}</option>` : ""}
      ${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}
    </select>`;
  } else if (f.type === "checkbox") {
    return `<label class="check"><input type="checkbox" name="${f.name}" ${f.value ? "checked" : ""}> ${esc(f.label)}</label>`;
  } else {
    const attrs = ["min", "max", "step", "minlength", "maxlength", "pattern", "autocomplete"]
      .filter((a) => f[a] !== undefined)
      .map((a) => `${a}="${esc(f[a])}"`)
      .join(" ");
    input = `<input id="${id}" name="${f.name}" type="${f.type || "text"}" value="${esc(value)}" ${req} ${attrs} placeholder="${esc(f.placeholder || "")}">`;
  }
  return `<label class="field" for="${id}"><span>${esc(f.label)}</span>${input}${f.hint ? `<small class="muted">${esc(f.hint)}</small>` : ""}</label>`;
}

function readForm(form, fields) {
  const values = {};
  for (const f of fields) {
    const input = form.elements[f.name];
    if (f.type === "checkbox") values[f.name] = input.checked;
    else if (f.type === "number") values[f.name] = input.value === "" ? null : Number(input.value);
    else values[f.name] = input.value.trim() === "" ? null : input.value.trim();
  }
  return values;
}

// Builds a <form>; onSubmit gets the values and may throw — the error is shown inside the form
function buildForm({ fields, submitLabel, onSubmit, cancel = false }) {
  const form = el(`
    <form class="form" novalidate>
      ${fields.map(fieldHtml).join("")}
      <div class="form-error" hidden></div>
      <div class="form-actions">
        ${cancel ? `<button type="button" class="btn btn-ghost" data-close>Отмена</button>` : ""}
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </div>
    </form>`);
  const errorBox = form.querySelector(".form-error");
  const button = form.querySelector('[type="submit"]');

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.hidden = true;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    button.disabled = true;
    button.classList.add("loading");
    try {
      await onSubmit(readForm(form, fields));
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    } finally {
      button.disabled = false;
      button.classList.remove("loading");
    }
  });
  return form;
}

function formModal({ title, fields, submitLabel = "Сохранить", onSubmit }) {
  let modal;
  const form = buildForm({
    fields,
    submitLabel,
    cancel: true,
    onSubmit: async (values) => {
      await onSubmit(values);
      modal.close();
    },
  });
  modal = openModal({ title, content: form });
  const first = form.querySelector("input, textarea, select");
  if (first) first.focus();
  return modal;
}

function pager(meta, onPage) {
  if (!meta || meta.total_pages <= 1) return null;
  const node = el(`
    <div class="pager">
      <button class="btn btn-ghost btn-sm" data-p="${meta.page - 1}" ${meta.page <= 1 ? "disabled" : ""}>← Назад</button>
      <span class="muted">Страница ${meta.page} из ${meta.total_pages} · всего ${meta.total}</span>
      <button class="btn btn-ghost btn-sm" data-p="${meta.page + 1}" ${meta.page >= meta.total_pages ? "disabled" : ""}>Вперёд →</button>
    </div>`);
  node.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-p]");
    if (btn && !btn.disabled) onPage(Number(btn.dataset.p));
  });
  return node;
}

/* ---------------- header ---------------- */

function renderHeader() {
  const links = [`<a href="#/" data-nav="/">Афиша</a>`];
  links.push(`<a href="#/about" data-nav="/about">О кинотеатре</a>`);
  if (state.user) links.push(`<a href="#/tickets" data-nav="/tickets">Мои билеты</a>`);
  if (isStaff()) links.push(`<a href="#/admin" data-nav="/admin">Управление</a>`);

  const account = state.user
    ? `<a href="#/profile" class="user-chip" data-nav="/profile" title="Профиль">
         <span class="avatar">${esc(state.user.full_name.trim()[0] || "?")}</span>${esc(state.user.full_name)}
       </a>
       <button class="btn btn-ghost btn-sm" id="logout">Выйти</button>`
    : `<a href="#/login" class="btn btn-ghost btn-sm">Войти</a>
       <a href="#/register" class="btn btn-primary btn-sm">Регистрация</a>`;

  $nav.innerHTML = `<div class="nav-links">${links.join("")}</div><div class="nav-account">${account}</div>`;
  const logout = document.getElementById("logout");
  if (logout) {
    logout.addEventListener("click", () => {
      api.setToken(null);
      state.user = null;
      renderHeader();
      toast("Вы вышли из аккаунта");
      go("/");
    });
  }
  highlightNav();
}

function highlightNav() {
  const path = (location.hash.slice(1) || "/").split("?")[0];
  $nav.querySelectorAll("[data-nav]").forEach((a) => {
    const target = a.dataset.nav;
    a.classList.toggle("active", target === "/" ? path === "/" || path.startsWith("/movie") || path.startsWith("/showtime") : path.startsWith(target));
  });
}

document.getElementById("burger").addEventListener("click", (e) => {
  const open = $nav.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", String(open));
});

/* ---------------- views ---------------- */

async function homeView(ctx) {
  const [movies, upcoming, halls] = await Promise.all([
    api.getAll("/movies", { is_active: true, sort: "title" }),
    api.get("/showtimes", { status: "scheduled", date_from: nowIso(), page_size: 10 }),
    hallsMap(),
  ]);
  const movieById = new Map(movies.map((m) => [m.id, m]));
  const genres = [...new Set(movies.map((m) => m.genre).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const upcomingCards = upcoming.data
    .filter((s) => movieById.has(s.movie_id))
    .map((s) => {
      const m = movieById.get(s.movie_id);
      return `
        <a class="upcoming-card" href="#/showtime/${s.id}">
          <span class="upcoming-time">${fmt.time(s.starts_at)}</span>
          <span class="upcoming-day">${esc(fmt.shortDay(s.starts_at))}</span>
          <b>${esc(m.title)}</b>
          <span class="muted">${esc(halls.get(s.hall_id)?.name || "Зал")} · ${fmt.price(s.ticket_price)}</span>
        </a>`;
    })
    .join("");

  if (!ctx.render(`
    <section class="hero">
      <div class="hero-text">
        <p class="eyebrow">Онлайн-кинотеатр</p>
        <h1>CineDushanbe — кино начинается здесь</h1>
        <p class="lead">Выберите фильм, удобный сеанс и лучшее место в зале. Билет — за минуту, без очередей.</p>
        <div class="hero-stats">
          <div><b>${movies.length}</b><span>${plural(movies.length, "фильм", "фильма", "фильмов")} в прокате</span></div>
          <div><b>${upcoming.meta?.total ?? 0}</b><span>${plural(upcoming.meta?.total ?? 0, "сеанс", "сеанса", "сеансов")} впереди</span></div>
          <div><b>${halls.size}</b><span>${plural(halls.size, "зал", "зала", "залов")}</span></div>
        </div>
      </div>
      <div class="hero-art" aria-hidden="true">
        ${movies.slice(0, 3).map((m, i) => `<div class="hero-poster hp-${i}">${poster(m)}</div>`).join("")}
      </div>
    </section>

    ${upcomingCards ? `
      <section class="section">
        <div class="section-head"><h2>Ближайшие сеансы</h2></div>
        <div class="upcoming-row">${upcomingCards}</div>
      </section>` : ""}

    <section class="section">
      <div class="section-head">
        <h2>Афиша</h2>
        <div class="filters">
          <input type="search" id="search" placeholder="Поиск фильма…" aria-label="Поиск фильма">
          ${genres.length ? `
            <div class="chips" id="genres">
              <button class="chip active" data-genre="">Все</button>
              ${genres.map((g) => `<button class="chip" data-genre="${esc(g)}">${esc(g)}</button>`).join("")}
            </div>` : ""}
        </div>
      </div>
      <div class="movie-grid" id="movie-grid"></div>
    </section>`)) return;

  let genre = "";
  const grid = document.getElementById("movie-grid");
  const search = document.getElementById("search");

  function renderGrid() {
    const q = search.value.trim().toLowerCase();
    const list = movies.filter((m) => (!genre || m.genre === genre) && (!q || m.title.toLowerCase().includes(q)));
    grid.innerHTML = list.length
      ? list.map((m) => `
          <a class="movie-card" href="#/movie/${m.id}">
            ${poster(m)}
            <div class="movie-card-body">
              <h3>${esc(m.title)}</h3>
              <p class="muted">${[m.genre, fmt.duration(m.duration_minutes)].filter(Boolean).map(esc).join(" · ")}</p>
            </div>
          </a>`).join("")
      : emptyState(movies.length ? "Ничего не найдено" : "Афиша пока пуста", movies.length ? "Попробуйте изменить запрос" : "Скоро здесь появятся фильмы");
  }

  search.addEventListener("input", renderGrid);
  const chips = document.getElementById("genres");
  if (chips) {
    chips.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-genre]");
      if (!chip) return;
      genre = chip.dataset.genre;
      chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === chip));
      renderGrid();
    });
  }
  renderGrid();
}

async function movieView(ctx) {
  const id = ctx.params[0];
  const [movie, showtimes, halls] = await Promise.all([
    api.get(`/movies/${id}`).then((r) => r.data),
    api.getAll("/showtimes", { movie_id: id, status: "scheduled", date_from: nowIso() }),
    hallsMap(),
  ]);

  const byDay = new Map();
  for (const s of showtimes) {
    const key = new Date(s.starts_at).toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(s);
  }

  const schedule = byDay.size
    ? [...byDay.values()].map((list) => `
        <div class="day-block">
          <h4>${esc(fmt.day(list[0].starts_at))}</h4>
          <div class="slots">
            ${list.map((s) => `
              <a class="slot" href="#/showtime/${s.id}">
                <b>${fmt.time(s.starts_at)}</b>
                <span>${esc(halls.get(s.hall_id)?.name || "Зал")}</span>
                <span class="slot-price">${fmt.price(s.ticket_price)}</span>
              </a>`).join("")}
          </div>
        </div>`).join("")
    : emptyState("Сеансов пока нет", "Загляните позже — расписание обновляется");

  ctx.render(`
    <a href="#/" class="back-link">← Вся афиша</a>
    <section class="movie-hero">
      ${poster(movie, "poster-lg")}
      <div class="movie-info">
        <h1>${esc(movie.title)}</h1>
        <div class="meta-row">
          ${movie.genre ? badge(movie.genre, "neutral") : ""}
          ${badge(fmt.duration(movie.duration_minutes), "neutral")}
          ${movie.age_rating ? badge(movie.age_rating, "accent") : ""}
          ${movie.is_active ? "" : badge("Снят с показа", "danger")}
        </div>
        <p class="description">${movie.description ? esc(movie.description) : '<span class="muted">Описание пока не добавлено.</span>'}</p>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>Расписание</h2></div>
      ${schedule}
    </section>`);
}

async function showtimeView(ctx) {
  const id = Number(ctx.params[0]);
  const [showtime, seatMap] = await Promise.all([
    api.get(`/showtimes/${id}`).then((r) => r.data),
    api.get(`/showtimes/${id}/seats`).then((r) => r.data),
  ]);
  const movie = (await api.get(`/movies/${showtime.movie_id}`)).data;

  const started = new Date(showtime.starts_at) <= new Date();
  const bookable = showtime.status === "scheduled" && !started;
  let notice = "";
  if (showtime.status !== "scheduled") notice = `Сеанс ${SHOWTIME_STATUS_TEXT[showtime.status].toLowerCase()} — бронирование недоступно.`;
  else if (started) notice = "Сеанс уже начался — бронирование недоступно.";

  const rows = seatMap.rows.map((row) => `
    <div class="seat-row">
      <span class="row-label">${row.row_number}</span>
      <div class="seats">
        ${row.seats.map((s) => `
          <button class="seat seat-${s.status}" data-id="${s.id}" data-row="${row.row_number}" data-num="${s.seat_number}"
            ${s.status !== "available" || !bookable ? "disabled" : ""}
            title="Ряд ${row.row_number}, место ${s.seat_number}${s.status === "booked" ? " — занято" : s.status === "unavailable" ? " — недоступно" : ""}"
            aria-label="Ряд ${row.row_number}, место ${s.seat_number}">${s.seat_number}</button>`).join("")}
      </div>
      <span class="row-label">${row.row_number}</span>
    </div>`).join("");

  if (!ctx.render(`
    <a href="#/movie/${movie.id}" class="back-link">← ${esc(movie.title)}</a>
    <div class="booking">
      <section class="booking-main">
        <div class="booking-head">
          <h1>${esc(movie.title)}</h1>
          <p class="muted">${esc(fmt.day(showtime.starts_at))}, ${fmt.time(showtime.starts_at)}–${fmt.time(showtime.ends_at)} · ${esc(seatMap.hall_name)}</p>
        </div>
        ${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
        <div class="hall">
          <div class="screen">Экран</div>
          <div class="seat-map" id="seat-map">
            ${rows || emptyState("В зале ещё нет мест")}
          </div>
          <div class="legend">
            <span><i class="seat seat-available"></i>Свободно</span>
            <span><i class="seat seat-selected"></i>Выбрано</span>
            <span><i class="seat seat-booked"></i>Занято</span>
            <span><i class="seat seat-unavailable"></i>Недоступно</span>
          </div>
          <p class="muted center">Свободно ${seatMap.summary.available} из ${seatMap.summary.total}</p>
        </div>
      </section>
      <aside class="booking-side">
        <div class="summary-card">
          <h3>Ваш заказ</h3>
          <div id="summary"></div>
        </div>
      </aside>
    </div>`)) return;

  const selected = new Map();
  const summary = document.getElementById("summary");

  function renderSummary() {
    const count = selected.size;
    const total = count * Number(showtime.ticket_price);
    summary.innerHTML = `
      <dl class="summary-list">
        <div><dt>Цена билета</dt><dd>${fmt.price(showtime.ticket_price)}</dd></div>
        <div><dt>Места</dt><dd>${count ? [...selected.values()].map((s) => `<span class="seat-tag">${s.row} ряд · ${s.num}</span>`).join("") : '<span class="muted">не выбраны</span>'}</dd></div>
      </dl>
      <div class="summary-total"><span>Итого</span><b>${fmt.price(total)}</b></div>
      <button class="btn btn-primary btn-block" id="book" ${!count || !bookable ? "disabled" : ""}>
        ${state.user ? (count ? `Купить ${count} ${plural(count, "билет", "билета", "билетов")}` : "Выберите места") : "Войти и купить"}
      </button>
      <p class="muted small">Билет можно отменить до начала сеанса.</p>`;
    document.getElementById("book").addEventListener("click", book);
  }

  document.getElementById("seat-map").addEventListener("click", (e) => {
    const seat = e.target.closest(".seat");
    if (!seat || seat.disabled) return;
    const seatId = Number(seat.dataset.id);
    if (selected.has(seatId)) {
      selected.delete(seatId);
      seat.classList.remove("seat-selected");
    } else {
      if (selected.size >= MAX_SEATS_PER_ORDER) {
        toast(`Не больше ${MAX_SEATS_PER_ORDER} мест за один заказ`, "error");
        return;
      }
      selected.set(seatId, { row: seat.dataset.row, num: seat.dataset.num });
      seat.classList.add("seat-selected");
    }
    renderSummary();
  });

  async function book() {
    if (!state.user) {
      go(`/login?next=${encodeURIComponent(`/showtime/${id}`)}`);
      return;
    }
    const button = document.getElementById("book");
    button.disabled = true;
    button.classList.add("loading");

    // The API books one seat per request
    let booked = 0;
    const failed = [];
    for (const [seatId, s] of selected) {
      try {
        await api.post("/tickets", { showtime_id: id, seat_id: seatId });
        booked++;
      } catch (err) {
        failed.push(`Ряд ${s.row}, место ${s.num}: ${err.message}`);
      }
    }
    if (booked) toast(`Готово! ${booked} ${plural(booked, "билет куплен", "билета куплено", "билетов куплено")}`, "success");
    failed.forEach((msg) => toast(msg, "error"));
    if (booked && !failed.length) go("/tickets");
    else router();
  }

  renderSummary();
}

async function loadTicketDetails(tickets) {
  const showtimeIds = [...new Set(tickets.map((t) => t.showtime_id))];
  const showtimes = new Map(
    await Promise.all(showtimeIds.map(async (sid) => [sid, (await api.get(`/showtimes/${sid}`)).data]))
  );
  const movieIds = [...new Set([...showtimes.values()].map((s) => s.movie_id))];
  const hallIds = [...new Set([...showtimes.values()].map((s) => s.hall_id))];

  const [movieList, seatLists, halls] = await Promise.all([
    Promise.all(movieIds.map(async (mid) => (await api.get(`/movies/${mid}`)).data)),
    Promise.all(hallIds.map(async (hid) => (await api.get(`/halls/${hid}/seats`)).data)),
    hallsMap(),
  ]);
  return {
    showtimes,
    movies: new Map(movieList.map((m) => [m.id, m])),
    seats: new Map(seatLists.flat().map((s) => [s.id, s])),
    halls,
  };
}

async function ticketsView(ctx) {
  const tickets = await api.getAll("/tickets/my", { sort: "-booked_at" });
  const details = await loadTicketDetails(tickets);
  const now = new Date();

  const groupOf = (t) => {
    const s = details.showtimes.get(t.showtime_id);
    if (t.status === "cancelled") return "cancelled";
    return new Date(s.starts_at) > now && s.status === "scheduled" ? "upcoming" : "past";
  };
  const counts = { upcoming: 0, past: 0, cancelled: 0 };
  tickets.forEach((t) => counts[groupOf(t)]++);

  if (!ctx.render(`
    <div class="page-head">
      <h1>Мои билеты</h1>
      <div class="chips" id="ticket-tabs">
        <button class="chip active" data-tab="upcoming">Предстоящие · ${counts.upcoming}</button>
        <button class="chip" data-tab="past">Прошедшие · ${counts.past}</button>
        <button class="chip" data-tab="cancelled">Отменённые · ${counts.cancelled}</button>
      </div>
    </div>
    <div class="ticket-list" id="ticket-list"></div>`)) return;

  const list = document.getElementById("ticket-list");
  let tab = "upcoming";

  function renderList() {
    const items = tickets.filter((t) => groupOf(t) === tab);
    if (!items.length) {
      list.innerHTML = tab === "upcoming"
        ? emptyState("Нет предстоящих билетов", "Самое время выбрать фильм", '<a href="#/" class="btn btn-primary">Перейти в афишу</a>')
        : emptyState("Здесь пока пусто");
      return;
    }
    list.innerHTML = items.map((t) => {
      const s = details.showtimes.get(t.showtime_id);
      const m = details.movies.get(s.movie_id);
      const seat = details.seats.get(t.seat_id);
      const canCancel = groupOf(t) === "upcoming";
      return `
        <article class="ticket ${t.status === "cancelled" ? "ticket-cancelled" : ""}">
          <div class="ticket-main">
            ${poster(m, "poster-xs")}
            <div>
              <h3><a href="#/movie/${m.id}">${esc(m.title)}</a></h3>
              <p>${esc(fmt.day(s.starts_at))}, <b>${fmt.time(s.starts_at)}</b></p>
              <p class="muted">${esc(details.halls.get(s.hall_id)?.name || "Зал")} · ${seat ? `ряд ${seat.row_number}, место ${seat.seat_number}` : `место #${t.seat_id}`}</p>
            </div>
          </div>
          <div class="ticket-stub">
            <span class="muted small">Билет № ${t.id}</span>
            <b class="ticket-price">${fmt.price(t.price)}</b>
            ${badge(TICKET_STATUS_TEXT[t.status], t.status === "booked" ? "success" : "danger")}
            ${canCancel ? `<button class="btn btn-ghost btn-sm" data-cancel="${t.id}">Отменить</button>` : ""}
          </div>
        </article>`;
    }).join("");
  }

  document.getElementById("ticket-tabs").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-tab]");
    if (!chip) return;
    tab = chip.dataset.tab;
    document.querySelectorAll("#ticket-tabs .chip").forEach((c) => c.classList.toggle("active", c === chip));
    renderList();
  });

  list.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (!btn) return;
    if (!(await confirmDialog("Отменить этот билет? Место снова станет доступным для покупки.", { okLabel: "Отменить билет", danger: true }))) return;
    try {
      await api.post(`/tickets/${btn.dataset.cancel}/cancel`);
      toast("Билет отменён", "success");
      router();
    } catch (err) {
      toast(err.message, "error");
    }
  });

  renderList();
}

async function profileView(ctx) {
  const user = state.user;
  if (!ctx.render(`
    <div class="narrow">
      <h1>Профиль</h1>
      <div class="card profile-card">
        <div class="profile-head">
          <span class="avatar avatar-lg">${esc(user.full_name.trim()[0] || "?")}</span>
          <div>
            <h3>${esc(user.full_name)}</h3>
            <p class="muted">${esc(user.email)} · ${badge(ROLE_TEXT[user.role], "accent")}</p>
            <p class="muted small">С нами с ${new Date(user.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>
        <div id="profile-form"></div>
      </div>
    </div>`)) return;

  const form = buildForm({
    submitLabel: "Сохранить изменения",
    fields: [
      { name: "full_name", label: "Имя", value: user.full_name, required: true, minlength: 2, maxlength: 150 },
      { name: "email", label: "Email", type: "email", value: user.email, required: true },
      { name: "password", label: "Новый пароль", type: "password", minlength: 8, autocomplete: "new-password", hint: "Оставьте пустым, чтобы не менять" },
    ],
    onSubmit: async (values) => {
      const body = {};
      if (values.full_name !== user.full_name) body.full_name = values.full_name;
      if (values.email !== user.email) body.email = values.email;
      if (values.password) body.password = values.password;
      if (!Object.keys(body).length) {
        toast("Нет изменений");
        return;
      }
      state.user = (await api.patch("/users/me", body)).data;
      renderHeader();
      toast("Профиль обновлён", "success");
      router();
    },
  });
  document.getElementById("profile-form").append(form);
}

function authLayout(title, subtitle, footer) {
  return `
    <div class="auth">
      <div class="auth-card card">
        <a href="#/" class="logo logo-center"><span class="logo-mark"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg></span>CineDushanbe</a>
        <h1>${esc(title)}</h1>
        <p class="muted center">${esc(subtitle)}</p>
        <div id="auth-form"></div>
        <p class="center muted">${footer}</p>
      </div>
    </div>`;
}

async function finishLogin(email, password, next) {
  const { access_token } = await api.login(email, password);
  api.setToken(access_token);
  state.user = (await api.get("/users/me")).data;
  renderHeader();
  toast(`Добро пожаловать, ${state.user.full_name}!`, "success");
  go(next || "/");
}

async function loginView(ctx) {
  if (state.user) return go("/");
  const next = ctx.query.get("next");
  const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";
  if (!ctx.render(authLayout("Вход", "Войдите, чтобы покупать билеты", `Нет аккаунта? <a href="#/register${nextParam}">Зарегистрируйтесь</a>`))) return;

  document.getElementById("auth-form").append(buildForm({
    submitLabel: "Войти",
    fields: [
      { name: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
      { name: "password", label: "Пароль", type: "password", required: true, autocomplete: "current-password" },
    ],
    onSubmit: (v) => finishLogin(v.email, v.password, next),
  }));
}

async function registerView(ctx) {
  if (state.user) return go("/");
  const next = ctx.query.get("next");
  const nextParam = next ? `?next=${encodeURIComponent(next)}` : "";
  if (!ctx.render(authLayout("Регистрация", "Создайте аккаунт за полминуты", `Уже есть аккаунт? <a href="#/login${nextParam}">Войдите</a>`))) return;

  document.getElementById("auth-form").append(buildForm({
    submitLabel: "Создать аккаунт",
    fields: [
      { name: "full_name", label: "Имя", required: true, minlength: 2, maxlength: 150, autocomplete: "name" },
      { name: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
      { name: "password", label: "Пароль", type: "password", required: true, minlength: 8, autocomplete: "new-password", hint: "Минимум 8 символов" },
      { name: "password2", label: "Повторите пароль", type: "password", required: true, autocomplete: "new-password" },
    ],
    onSubmit: async (v) => {
      if (v.password !== v.password2) throw new Error("Пароли не совпадают");
      await api.post("/auth/register", { full_name: v.full_name, email: v.email, password: v.password });
      await finishLogin(v.email, v.password, next);
    },
  }));
}

/* ---------------- about ---------------- */

async function aboutView(ctx) {
  const [halls, movies, upcoming] = await Promise.all([
    api.getAll("/halls", { is_active: true }),
    api.get("/movies", { is_active: true, page_size: 1 }),
    api.get("/showtimes", { status: "scheduled", date_from: nowIso(), page_size: 1 }),
  ]);
  const totalSeats = halls.reduce((sum, h) => sum + h.capacity, 0);
  const movieCount = movies.meta?.total ?? 0;
  const showtimeCount = upcoming.meta?.total ?? 0;

  const steps = [
    ["Выберите фильм", "Откройте афишу и найдите фильм по названию или жанру."],
    ["Выберите сеанс", "На странице фильма — расписание по дням, залам и ценам."],
    ["Выберите места", "Отметьте свободные места на схеме зала — до 10 за один заказ."],
    ["Получите билет", "Билет сразу появится в разделе «Мои билеты»."],
  ];

  const rules = [
    ["🎟️", "Билеты", "Покажите номер билета из раздела «Мои билеты» на входе в зал."],
    ["↩️", "Отмена", "Билет можно отменить на сайте в любой момент до начала сеанса — место снова станет свободным."],
    ["🔞", "Возрастные ограничения", "Возрастной рейтинг указан на каждом фильме. Сотрудники могут попросить документ, удостоверяющий возраст."],
    ["⏰", "Опоздания", "Приходите за 10–15 минут до начала. После начала сеанса билет уже нельзя отменить."],
    ["🍿", "Еда и напитки", "Попкорн и напитки из нашего бара можно брать с собой в зал."],
    ["📵", "Тишина в зале", "Пожалуйста, переведите телефон в беззвучный режим и не ведите съёмку экрана."],
  ];

  const faq = [
    ["Нужно ли регистрироваться, чтобы купить билет?", "Да. Афишу и расписание можно смотреть без аккаунта, а для покупки нужен вход — так билеты сохраняются в вашем профиле."],
    ["Могут ли два человека купить одно и то же место?", "Нет. Система гарантирует, что одно место на сеанс продаётся только один раз, даже если двое нажали «Купить» одновременно."],
    ["Как отменить билет?", "Откройте «Мои билеты», найдите билет в разделе «Предстоящие» и нажмите «Отменить». Это возможно до начала сеанса."],
    ["Что будет, если сеанс отменят?", "Все билеты на отменённый сеанс автоматически отменяются, а статус билета изменится в разделе «Мои билеты»."],
    ["Почему место отмечено пунктиром?", "Такое место временно недоступно для продажи — например, на обслуживании."],
    ["Можно ли купить несколько билетов сразу?", `Да, до ${MAX_SEATS_PER_ORDER} мест за один заказ на один сеанс.`],
  ];

  ctx.render(`
    <section class="about-hero">
      <p class="eyebrow">О кинотеатре</p>
      <h1>CineDushanbe — кино в самом сердце Душанбе</h1>
      <p class="lead">Мы показываем новинки мирового и отечественного кино в комфортных залах с удобными креслами и чётким звуком. Билеты — онлайн, без очередей: выберите фильм, сеанс и своё место за пару кликов.</p>
      <div class="hero-stats">
        <div><b>${halls.length}</b><span>${plural(halls.length, "зал", "зала", "залов")}</span></div>
        <div><b>${totalSeats}</b><span>${plural(totalSeats, "место", "места", "мест")}</span></div>
        <div><b>${movieCount}</b><span>${plural(movieCount, "фильм", "фильма", "фильмов")} в прокате</span></div>
        <div><b>${showtimeCount}</b><span>${plural(showtimeCount, "сеанс", "сеанса", "сеансов")} впереди</span></div>
      </div>
    </section>

    <section class="section">
      <div class="section-head"><h2>Как купить билет</h2></div>
      <ol class="steps">
        ${steps.map(([title, text], i) => `
          <li class="step">
            <span class="step-num">${i + 1}</span>
            <h3>${esc(title)}</h3>
            <p class="muted">${esc(text)}</p>
          </li>`).join("")}
      </ol>
      <div class="center"><a href="#/" class="btn btn-primary">Перейти в афишу</a></div>
    </section>

    ${halls.length ? `
      <section class="section">
        <div class="section-head"><h2>Наши залы</h2></div>
        <div class="hall-cards">
          ${halls.map((h) => `
            <div class="hall-card">
              <span class="hall-icon" aria-hidden="true">🎬</span>
              <h3>${esc(h.name)}</h3>
              <p class="muted">${h.capacity} ${plural(h.capacity, "место", "места", "мест")}</p>
            </div>`).join("")}
        </div>
      </section>` : ""}

    <section class="section">
      <div class="section-head"><h2>Правила посещения</h2></div>
      <div class="rules">
        ${rules.map(([icon, title, text]) => `
          <div class="rule">
            <span class="rule-icon" aria-hidden="true">${icon}</span>
            <div>
              <h3>${esc(title)}</h3>
              <p class="muted">${esc(text)}</p>
            </div>
          </div>`).join("")}
      </div>
    </section>

    <section class="section about-columns">
      <div>
        <div class="section-head"><h2>Частые вопросы</h2></div>
        <div class="faq">
          ${faq.map(([q, a]) => `
            <details class="faq-item">
              <summary>${esc(q)}</summary>
              <p class="muted">${esc(a)}</p>
            </details>`).join("")}
        </div>
      </div>
      <aside>
        <div class="section-head"><h2>Контакты</h2></div>
        <div class="card contact-card">
          <dl class="contact-list">
            <div><dt>Адрес</dt><dd>${esc(CINEMA_INFO.address)}</dd></div>
            <div><dt>Телефон</dt><dd><a href="tel:${esc(CINEMA_INFO.phone.replace(/\s/g, ""))}">${esc(CINEMA_INFO.phone)}</a></dd></div>
            <div><dt>Email</dt><dd><a href="mailto:${esc(CINEMA_INFO.email)}">${esc(CINEMA_INFO.email)}</a></dd></div>
          </dl>
          <h4>Часы работы</h4>
          <dl class="contact-list">
            ${CINEMA_INFO.hours.map(([days, time]) => `<div><dt>${esc(days)}</dt><dd>${esc(time)}</dd></div>`).join("")}
          </dl>
          <div class="socials">
            ${CINEMA_INFO.socials.map(([name, url]) => `<a class="btn btn-ghost btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`).join("")}
          </div>
        </div>
      </aside>
    </section>`);
}

/* ---------------- admin ---------------- */

const ADMIN_TABS = [
  { id: "movies", label: "Фильмы", render: adminMovies },
  { id: "halls", label: "Залы и места", render: adminHalls },
  { id: "showtimes", label: "Сеансы", render: adminShowtimes },
  { id: "tickets", label: "Билеты", render: adminTickets },
  { id: "users", label: "Пользователи", render: adminUsers, adminOnly: true },
];

async function adminView(ctx) {
  const tabs = ADMIN_TABS.filter((t) => !t.adminOnly || isAdmin());
  const current = tabs.find((t) => t.id === ctx.params[0]) || tabs[0];

  if (!ctx.render(`
    <div class="page-head">
      <h1>Управление</h1>
      <span class="muted">${esc(ROLE_TEXT[state.user.role])}</span>
    </div>
    <div class="tabs">
      ${tabs.map((t) => `<a href="#/admin/${t.id}" class="tab ${t === current ? "active" : ""}">${t.label}</a>`).join("")}
    </div>
    <div id="admin-body"><div class="loader"></div></div>`)) return;

  const body = document.getElementById("admin-body");
  const reload = async () => {
    try {
      await current.render(body, reload);
    } catch (err) {
      body.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`;
    }
  };
  await reload();
}

function adminToolbar(title, buttonLabel) {
  return `<div class="toolbar"><h2>${esc(title)}</h2>${buttonLabel ? `<button class="btn btn-primary" data-add>${esc(buttonLabel)}</button>` : ""}</div>`;
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}" class="muted center">Пусто</td></tr>`}</tbody>
      </table>
    </div>`;
}

// Runs an admin action, reports the result and reloads the tab
async function adminAction(fn, successMessage, reload) {
  try {
    await fn();
    toast(successMessage, "success");
    await reload();
  } catch (err) {
    toast(err.message, "error");
  }
}

function movieFields(m = {}) {
  const fields = [
    { name: "title", label: "Название", value: m.title, required: true, maxlength: 255 },
    { name: "description", label: "Описание", type: "textarea", value: m.description },
    { name: "duration_minutes", label: "Длительность, мин", type: "number", value: m.duration_minutes, required: true, min: 1 },
    { name: "genre", label: "Жанр", value: m.genre, maxlength: 100, placeholder: "Драма, комедия…" },
    { name: "age_rating", label: "Возрастной рейтинг", value: m.age_rating, pattern: "\\d{1,2}\\+", placeholder: "0+, 6+, 12+, 16+, 18+" },
  ];
  if (m.id) fields.push({ name: "is_active", label: "В прокате", type: "checkbox", value: m.is_active });
  return fields;
}

async function adminMovies(body, reload) {
  const [active, inactive] = await Promise.all([
    api.getAll("/movies", { is_active: true }),
    api.getAll("/movies", { is_active: false }),
  ]);
  const movies = [...active, ...inactive].sort((a, b) => a.id - b.id);
  const byId = new Map(movies.map((m) => [m.id, m]));

  body.innerHTML = adminToolbar(`Фильмы · ${movies.length}`, "+ Добавить фильм") + table(
    ["ID", "Название", "Жанр", "Длительность", "Возраст", "Статус", ""],
    movies.map((m) => `
      <tr>
        <td>${m.id}</td>
        <td><a href="#/movie/${m.id}">${esc(m.title)}</a></td>
        <td>${esc(m.genre || "—")}</td>
        <td>${fmt.duration(m.duration_minutes)}</td>
        <td>${esc(m.age_rating || "—")}</td>
        <td>${m.is_active ? badge("В прокате", "success") : badge("Снят", "neutral")}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" data-edit="${m.id}">Изменить</button>
          ${m.is_active ? `<button class="btn btn-ghost btn-sm danger-text" data-deactivate="${m.id}">Снять с показа</button>` : ""}
        </td>
      </tr>`)
  );

  body.querySelector("[data-add]").onclick = () => formModal({
    title: "Новый фильм",
    fields: movieFields(),
    submitLabel: "Создать",
    onSubmit: async (v) => {
      await api.post("/movies", v);
      toast("Фильм добавлен", "success");
      reload();
    },
  });

  body.onclick = async (e) => {
    const edit = e.target.closest("[data-edit]");
    const deactivate = e.target.closest("[data-deactivate]");
    if (edit) {
      const m = byId.get(Number(edit.dataset.edit));
      formModal({
        title: `Фильм: ${m.title}`,
        fields: movieFields(m),
        onSubmit: async (v) => {
          await api.patch(`/movies/${m.id}`, v);
          toast("Фильм обновлён", "success");
          reload();
        },
      });
    } else if (deactivate) {
      const m = byId.get(Number(deactivate.dataset.deactivate));
      if (await confirmDialog(`Снять «${m.title}» с показа? Фильм пропадёт из афиши.`, { okLabel: "Снять", danger: true })) {
        adminAction(() => api.del(`/movies/${m.id}`), "Фильм снят с показа", reload);
      }
    }
  };
}

async function adminHalls(body, reload) {
  const halls = await api.getAll("/halls");
  const seatCounts = await Promise.all(halls.map(async (h) => (await api.get(`/halls/${h.id}/seats`)).data.length));
  const byId = new Map(halls.map((h) => [h.id, h]));

  body.innerHTML = adminToolbar(`Залы · ${halls.length}`, "+ Добавить зал") + table(
    ["ID", "Название", "Мест создано", "Вместимость", "Статус", ""],
    halls.map((h, i) => `
      <tr>
        <td>${h.id}</td>
        <td>${esc(h.name)}</td>
        <td>${seatCounts[i]}</td>
        <td>${h.capacity}</td>
        <td>${h.is_active ? badge("Активен", "success") : badge("Закрыт", "neutral")}</td>
        <td class="actions">
          <button class="btn btn-ghost btn-sm" data-seats="${h.id}">Места</button>
          <button class="btn btn-ghost btn-sm" data-edit="${h.id}">Изменить</button>
        </td>
      </tr>`)
  );

  const hallFields = (h = {}) => [
    { name: "name", label: "Название", value: h.name, required: true, maxlength: 100, placeholder: "Зал 1" },
    { name: "capacity", label: "Вместимость (мест)", type: "number", value: h.capacity, required: true, min: 1 },
    ...(h.id ? [{ name: "is_active", label: "Зал активен", type: "checkbox", value: h.is_active }] : []),
  ];

  body.querySelector("[data-add]").onclick = () => formModal({
    title: "Новый зал",
    fields: hallFields(),
    submitLabel: "Создать",
    onSubmit: async (v) => {
      await api.post("/halls", v);
      toast("Зал создан. Теперь добавьте в него места.", "success");
      reload();
    },
  });

  body.onclick = (e) => {
    const edit = e.target.closest("[data-edit]");
    const seats = e.target.closest("[data-seats]");
    if (edit) {
      const h = byId.get(Number(edit.dataset.edit));
      formModal({
        title: `Зал: ${h.name}`,
        fields: hallFields(h),
        onSubmit: async (v) => {
          await api.patch(`/halls/${h.id}`, v);
          toast("Зал обновлён", "success");
          reload();
        },
      });
    } else if (seats) {
      seatsModal(byId.get(Number(seats.dataset.seats)), reload);
    }
  };
}

function seatsModal(hall, reloadTab) {
  const content = el(`<div><div class="loader"></div></div>`);
  openModal({ title: `Места — ${hall.name}`, content, wide: true, onClose: reloadTab });

  async function render() {
    const seats = (await api.get(`/halls/${hall.id}/seats`)).data;
    const rows = new Map();
    seats.forEach((s) => {
      if (!rows.has(s.row_number)) rows.set(s.row_number, []);
      rows.get(s.row_number).push(s);
    });

    content.innerHTML = `
      <p class="muted">Создано мест: <b>${seats.length}</b> из ${hall.capacity}. Нажмите на место, чтобы сделать его недоступным (или снова доступным).</p>
      <div class="hall hall-compact">
        <div class="screen">Экран</div>
        <div class="seat-map">
          ${[...rows.entries()].sort((a, b) => a[0] - b[0]).map(([row, list]) => `
            <div class="seat-row">
              <span class="row-label">${row}</span>
              <div class="seats">
                ${list.sort((a, b) => a.seat_number - b.seat_number).map((s) => `
                  <button class="seat ${s.is_active ? "seat-available" : "seat-unavailable"}" data-seat="${s.id}" data-active="${s.is_active}"
                    title="Ряд ${row}, место ${s.seat_number}">${s.seat_number}</button>`).join("")}
              </div>
            </div>`).join("") || '<p class="muted center">Мест пока нет</p>'}
        </div>
      </div>
      <h4>Сгенерировать места</h4>
      <form class="inline-form" id="gen-form">
        <label class="field"><span>Рядов</span><input type="number" name="rows" min="1" max="50" required value="${rows.size || 5}"></label>
        <label class="field"><span>Мест в ряду</span><input type="number" name="per_row" min="1" max="50" required value="${Math.max(0, ...[...rows.values()].map((l) => l.length)) || 10}"></label>
        <button class="btn btn-primary" type="submit">Создать недостающие</button>
      </form>
      <p class="muted small" id="gen-status">Уже существующие места пропускаются. Генерация остановится, когда будет достигнута вместимость зала.</p>`;

    content.querySelector(".seat-map").onclick = async (e) => {
      const seat = e.target.closest("[data-seat]");
      if (!seat) return;
      seat.disabled = true;
      try {
        await api.patch(`/seats/${seat.dataset.seat}`, { is_active: seat.dataset.active !== "true" });
        await render();
      } catch (err) {
        toast(err.message, "error");
        seat.disabled = false;
      }
    };

    content.querySelector("#gen-form").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const rowCount = Number(form.elements.rows.value);
      const perRow = Number(form.elements.per_row.value);
      const existing = new Set(seats.map((s) => `${s.row_number}:${s.seat_number}`));
      const status = content.querySelector("#gen-status");
      form.querySelector("button").disabled = true;

      let created = 0;
      let stopReason = "";
      outer: for (let r = 1; r <= rowCount; r++) {
        for (let n = 1; n <= perRow; n++) {
          if (existing.has(`${r}:${n}`)) continue;
          try {
            await api.post(`/halls/${hall.id}/seats`, { row_number: r, seat_number: n });
            created++;
            status.textContent = `Создано мест: ${created}…`;
          } catch (err) {
            stopReason = err.message;
            break outer;
          }
        }
      }
      toast(`Создано мест: ${created}${stopReason ? `. Остановлено: ${stopReason}` : ""}`, stopReason ? "error" : "success");
      await render();
    };
  }

  render().catch((err) => { content.innerHTML = `<div class="notice notice-error">${esc(err.message)}</div>`; });
}

async function adminShowtimes(body, reload) {
  if (!adminShowtimes.filter) adminShowtimes.filter = "upcoming";
  const upcomingOnly = adminShowtimes.filter === "upcoming";

  const [showtimes, activeMovies, inactiveMovies, halls] = await Promise.all([
    api.getAll("/showtimes", upcomingOnly
      ? { status: "scheduled", date_from: nowIso(), sort: "starts_at" }
      : { sort: "-starts_at" }),
    api.getAll("/movies", { is_active: true, sort: "title" }),
    api.getAll("/movies", { is_active: false }),
    hallsMap(),
  ]);
  const movies = new Map([...activeMovies, ...inactiveMovies].map((m) => [m.id, m]));
  const byId = new Map(showtimes.map((s) => [s.id, s]));

  body.innerHTML = `
    ${adminToolbar(`Сеансы · ${showtimes.length}`, "+ Добавить сеанс")}
    <div class="chips" id="st-filter">
      <button class="chip ${upcomingOnly ? "active" : ""}" data-f="upcoming">Предстоящие</button>
      <button class="chip ${upcomingOnly ? "" : "active"}" data-f="all">Все</button>
    </div>
    ${table(
      ["ID", "Фильм", "Зал", "Начало", "Конец", "Цена", "Статус", ""],
      showtimes.map((s) => {
        const editable = s.status === "scheduled" && new Date(s.starts_at) > new Date();
        return `
          <tr>
            <td>${s.id}</td>
            <td>${esc(movies.get(s.movie_id)?.title || `#${s.movie_id}`)}</td>
            <td>${esc(halls.get(s.hall_id)?.name || `#${s.hall_id}`)}</td>
            <td>${fmt.dateTime(s.starts_at)}</td>
            <td>${fmt.time(s.ends_at)}</td>
            <td>${fmt.price(s.ticket_price)}</td>
            <td>${badge(SHOWTIME_STATUS_TEXT[s.status], { scheduled: "success", cancelled: "danger", finished: "neutral" }[s.status])}</td>
            <td class="actions">
              <a class="btn btn-ghost btn-sm" href="#/showtime/${s.id}">Зал</a>
              ${editable ? `<button class="btn btn-ghost btn-sm" data-edit="${s.id}">Изменить</button>` : ""}
              ${s.status === "scheduled" ? `<button class="btn btn-ghost btn-sm" data-finish="${s.id}">Завершить</button>
              <button class="btn btn-ghost btn-sm danger-text" data-cancel="${s.id}">Отменить</button>` : ""}
            </td>
          </tr>`;
      })
    )}`;

  const movieOptions = activeMovies.map((m) => ({ value: m.id, label: `${m.title} (${fmt.duration(m.duration_minutes)})` }));
  const hallOptions = [...halls.values()].filter((h) => h.is_active).map((h) => ({ value: h.id, label: h.name }));

  body.querySelector("#st-filter").onclick = (e) => {
    const chip = e.target.closest("[data-f]");
    if (!chip) return;
    adminShowtimes.filter = chip.dataset.f;
    reload();
  };

  body.querySelector("[data-add]").onclick = () => formModal({
    title: "Новый сеанс",
    submitLabel: "Создать",
    fields: [
      { name: "movie_id", label: "Фильм", type: "select", options: movieOptions, placeholder: "Выберите фильм", required: true },
      { name: "hall_id", label: "Зал", type: "select", options: hallOptions, placeholder: "Выберите зал", required: true },
      { name: "starts_at", label: "Начало", type: "datetime-local", required: true, hint: "Время окончания посчитается по длительности фильма" },
      { name: "ticket_price", label: `Цена билета, ${CURRENCY}`, type: "number", min: 0.01, step: 0.01, required: true },
    ],
    onSubmit: async (v) => {
      await api.post("/showtimes", {
        movie_id: Number(v.movie_id),
        hall_id: Number(v.hall_id),
        starts_at: new Date(v.starts_at).toISOString(),
        ticket_price: v.ticket_price,
      });
      toast("Сеанс создан", "success");
      reload();
    },
  });

  body.querySelector("table").onclick = async (e) => {
    const edit = e.target.closest("[data-edit]");
    const finish = e.target.closest("[data-finish]");
    const cancel = e.target.closest("[data-cancel]");
    if (edit) {
      const s = byId.get(Number(edit.dataset.edit));
      formModal({
        title: `Сеанс #${s.id}`,
        fields: [
          { name: "movie_id", label: "Фильм", type: "select", options: movieOptions, value: s.movie_id, required: true },
          { name: "hall_id", label: "Зал", type: "select", options: hallOptions, value: s.hall_id, required: true },
          { name: "starts_at", label: "Начало", type: "datetime-local", value: toLocalInput(s.starts_at), required: true },
          { name: "ticket_price", label: `Цена билета, ${CURRENCY}`, type: "number", value: Number(s.ticket_price), min: 0.01, step: 0.01, required: true },
        ],
        onSubmit: async (v) => {
          // Send only what changed: moving time/hall re-runs the overlap check on the server
          const patch = {};
          if (Number(v.movie_id) !== s.movie_id) patch.movie_id = Number(v.movie_id);
          if (Number(v.hall_id) !== s.hall_id) patch.hall_id = Number(v.hall_id);
          if (v.starts_at !== toLocalInput(s.starts_at)) patch.starts_at = new Date(v.starts_at).toISOString();
          if (v.ticket_price !== Number(s.ticket_price)) patch.ticket_price = v.ticket_price;
          if (Object.keys(patch).length) await api.patch(`/showtimes/${s.id}`, patch);
          toast("Сеанс обновлён", "success");
          reload();
        },
      });
    } else if (finish) {
      if (await confirmDialog(`Отметить сеанс #${finish.dataset.finish} как завершённый?`)) {
        adminAction(() => api.patch(`/showtimes/${finish.dataset.finish}`, { status: "finished" }), "Сеанс завершён", reload);
      }
    } else if (cancel) {
      if (await confirmDialog(`Отменить сеанс #${cancel.dataset.cancel}? Все купленные на него билеты тоже будут отменены.`, { okLabel: "Отменить сеанс", danger: true })) {
        adminAction(() => api.del(`/showtimes/${cancel.dataset.cancel}`), "Сеанс и его билеты отменены", reload);
      }
    }
  };
}

async function adminTickets(body, reload) {
  const st = adminTickets.state || (adminTickets.state = { page: 1, status: "" });
  const res = await api.get("/tickets", { page: st.page, page_size: 20, status: st.status, sort: "-booked_at" });
  const details = await loadTicketDetails(res.data);

  body.innerHTML = `
    ${adminToolbar(`Билеты · ${res.meta.total}`)}
    <div class="chips" id="tk-filter">
      ${[["", "Все"], ["booked", "Активные"], ["cancelled", "Отменённые"]]
        .map(([v, l]) => `<button class="chip ${st.status === v ? "active" : ""}" data-s="${v}">${l}</button>`).join("")}
    </div>
    ${table(
      ["№", "Пользователь", "Фильм", "Сеанс", "Место", "Цена", "Статус", "Куплен", ""],
      res.data.map((t) => {
        const s = details.showtimes.get(t.showtime_id);
        const seat = details.seats.get(t.seat_id);
        const canCancel = isAdmin() && t.status === "booked" && new Date(s.starts_at) > new Date();
        return `
          <tr>
            <td>${t.id}</td>
            <td>#${t.user_id}</td>
            <td>${esc(details.movies.get(s.movie_id)?.title || "")}</td>
            <td>${fmt.dateTime(s.starts_at)} · ${esc(details.halls.get(s.hall_id)?.name || "")}</td>
            <td>${seat ? `${seat.row_number} ряд, ${seat.seat_number}` : `#${t.seat_id}`}</td>
            <td>${fmt.price(t.price)}</td>
            <td>${badge(TICKET_STATUS_TEXT[t.status], t.status === "booked" ? "success" : "danger")}</td>
            <td>${fmt.dateTime(t.booked_at)}</td>
            <td class="actions">${canCancel ? `<button class="btn btn-ghost btn-sm danger-text" data-cancel="${t.id}">Отменить</button>` : ""}</td>
          </tr>`;
      })
    )}`;

  const p = pager(res.meta, (page) => { st.page = page; reload(); });
  if (p) body.append(p);

  body.querySelector("#tk-filter").onclick = (e) => {
    const chip = e.target.closest("[data-s]");
    if (!chip) return;
    st.status = chip.dataset.s;
    st.page = 1;
    reload();
  };
  body.querySelector("table").onclick = async (e) => {
    const btn = e.target.closest("[data-cancel]");
    if (btn && (await confirmDialog(`Отменить билет № ${btn.dataset.cancel}?`, { okLabel: "Отменить билет", danger: true }))) {
      adminAction(() => api.post(`/tickets/${btn.dataset.cancel}/cancel`), "Билет отменён", reload);
    }
  };
}

async function adminUsers(body, reload) {
  const st = adminUsers.state || (adminUsers.state = { page: 1, search: "" });
  const res = await api.get("/users", { page: st.page, page_size: 20, search: st.search });

  body.innerHTML = `
    ${adminToolbar(`Пользователи · ${res.meta.total}`)}
    <form class="inline-form" id="user-search">
      <input type="search" name="q" placeholder="Имя или email" value="${esc(st.search)}" aria-label="Поиск пользователя">
      <button class="btn btn-ghost" type="submit">Найти</button>
    </form>
    ${table(
      ["ID", "Имя", "Email", "Роль", "Статус", "Регистрация"],
      res.data.map((u) => `
        <tr>
          <td>${u.id}</td>
          <td>${esc(u.full_name)}</td>
          <td>${esc(u.email)}</td>
          <td>
            <select data-role="${u.id}" ${u.id === state.user.id ? "disabled title=\"Нельзя изменить свою роль\"" : ""}>
              ${Object.entries(ROLE_TEXT).map(([v, l]) => `<option value="${v}" ${u.role === v ? "selected" : ""}>${l}</option>`).join("")}
            </select>
          </td>
          <td>${u.is_active ? badge("Активен", "success") : badge("Заблокирован", "danger")}</td>
          <td>${new Date(u.created_at).toLocaleDateString("ru-RU")}</td>
        </tr>`)
    )}`;

  const p = pager(res.meta, (page) => { st.page = page; reload(); });
  if (p) body.append(p);

  body.querySelector("#user-search").onsubmit = (e) => {
    e.preventDefault();
    st.search = e.currentTarget.elements.q.value.trim();
    st.page = 1;
    reload();
  };
  body.querySelector("table").onchange = (e) => {
    const select = e.target.closest("[data-role]");
    if (select) {
      adminAction(() => api.patch(`/users/${select.dataset.role}/role`, { role: select.value }), "Роль изменена", reload);
    }
  };
}

/* ---------------- router ---------------- */

const routes = [
  { re: /^\/$/, view: homeView },
  { re: /^\/movie\/(\d+)$/, view: movieView },
  { re: /^\/showtime\/(\d+)$/, view: showtimeView },
  { re: /^\/tickets$/, view: ticketsView, auth: true },
  { re: /^\/profile$/, view: profileView, auth: true },
  { re: /^\/login$/, view: loginView },
  { re: /^\/register$/, view: registerView },
  { re: /^\/about$/, view: aboutView },
  { re: /^\/admin(?:\/(\w+))?$/, view: adminView, staff: true },
];

let renderId = 0;

async function router() {
  const raw = location.hash.slice(1) || "/";
  const [path, query] = raw.split("?");
  const id = ++renderId;
  $nav.classList.remove("open");
  highlightNav();

  const route = routes.find((r) => r.re.test(path));
  if (!route) {
    $app.innerHTML = emptyState("Страница не найдена", "", '<a href="#/" class="btn btn-primary">На главную</a>');
    return;
  }
  if ((route.auth || route.staff) && !state.user) {
    go(`/login?next=${encodeURIComponent(raw)}`);
    return;
  }
  if (route.staff && !isStaff()) {
    $app.innerHTML = emptyState("Нет доступа", "Этот раздел доступен только сотрудникам кинотеатра");
    return;
  }

  $app.innerHTML = '<div class="loader"></div>';
  window.scrollTo(0, 0);
  const ctx = {
    params: path.match(route.re).slice(1),
    query: new URLSearchParams(query),
    // Ignore results of a view the user has already navigated away from
    render(html) {
      if (id !== renderId) return false;
      $app.innerHTML = html;
      return true;
    },
  };
  try {
    await route.view(ctx);
  } catch (err) {
    if (id === renderId) {
      $app.innerHTML = emptyState(err.status === 404 ? "Не найдено" : "Что-то пошло не так", err.message, '<a href="#/" class="btn btn-ghost">На главную</a>');
    }
  }
}

async function init() {
  api.onUnauthorized = () => {
    state.user = null;
    renderHeader();
    toast("Сессия истекла, войдите снова", "error");
  };
  if (api.token) {
    try {
      state.user = (await api.get("/users/me")).data;
    } catch {
      api.setToken(null);
    }
  }
  renderHeader();
  window.addEventListener("hashchange", router);
  router();
}

init();
