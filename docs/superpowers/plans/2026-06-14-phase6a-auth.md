# Spend Analyzer — Phase 6a: Single-Password Auth — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Checkbox (`- [ ]`) steps.

**Goal:** Gate the LAN-only app behind a single password. First visit sets the password (no env secret needed); thereafter a login is required. All data endpoints require an authenticated session; health + auth endpoints stay open. A Settings page lets you change the password.

**Architecture:** A single-row `AuthSetting` table holds the password hash (pbkdf2, stdlib). Starlette `SessionMiddleware` (signed cookie) holds the logged-in flag. A `require_auth` dependency protects the data routers via `include_router(..., dependencies=[Depends(require_auth)])`. The pytest `client` fixture auto-runs setup+login so the existing 61 tests pass unchanged (they run as an authenticated user); auth-specific tests clear the cookie to exercise the gate. Frontend: an `AuthGate` shows Setup → Login → app.

**Tech Stack:** FastAPI + Starlette SessionMiddleware (+ `itsdangerous`), stdlib pbkdf2; React. No password ever leaves the minipc; the hash is salted pbkdf2.

**Conventions:** TDD. One commit per task. Deploy is the final task (sets a persistent `SESSION_SECRET` on the minipc). Out of scope (6b): watched-folder, settings polish beyond change-password.

---

## Task 1: Backend auth (model, security, middleware, endpoints, guard) + conftest (TDD)

**Files:** add `AuthSetting` to `backend/app/models.py`; create `backend/app/security.py`, `backend/app/api/auth.py`, `backend/tests/test_auth.py`; modify `backend/app/main.py` (SessionMiddleware + protect routers); modify `backend/app/config.py` (session_secret already exists); modify `backend/tests/conftest.py` (authenticated client); add `itsdangerous` to `backend/requirements.txt`.

- [ ] **Step 1: Add `itsdangerous` to `backend/requirements.txt`** (Starlette SessionMiddleware needs it):
```
itsdangerous==2.2.0
```
Install: `cd backend && . .venv/bin/activate && pip install -r requirements-dev.txt`.

- [ ] **Step 2: Add `AuthSetting` to `backend/app/models.py`** (append):
```python
class AuthSetting(SQLModel, table=True):
    # single-row table (id always 1) holding the app password hash
    id: int | None = Field(default=None, primary_key=True)
    password_hash: str | None = None
```

- [ ] **Step 3: Write `backend/app/security.py`:**
```python
import hashlib
import hmac
import secrets

_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), _ITERATIONS)
    return f"pbkdf2_sha256${_ITERATIONS}${salt}${dk.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        algo, iters, salt, digest = stored.split("$")
    except ValueError:
        return False
    if algo != "pbkdf2_sha256":
        return False
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iters))
    return hmac.compare_digest(dk.hex(), digest)
```

- [ ] **Step 4: Write `backend/app/api/auth.py`:**
```python
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.db import get_session
from app.models import AuthSetting
from app.security import hash_password, verify_password

router = APIRouter()


class PasswordBody(BaseModel):
    password: str = Field(min_length=1)


class ChangeBody(BaseModel):
    current_password: str
    new_password: str = Field(min_length=1)


def _get_setting(session: Session) -> AuthSetting:
    setting = session.get(AuthSetting, 1)
    if setting is None:
        setting = AuthSetting(id=1, password_hash=None)
        session.add(setting)
        session.commit()
        session.refresh(setting)
    return setting


def require_auth(request: Request) -> None:
    if not request.session.get("auth"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")


@router.get("/auth/status")
def auth_status(request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    return {
        "configured": bool(setting.password_hash),
        "authenticated": bool(request.session.get("auth")),
    }


@router.post("/auth/setup")
def auth_setup(body: PasswordBody, request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if setting.password_hash:
        raise HTTPException(status_code=400, detail="password already set")
    setting.password_hash = hash_password(body.password)
    session.add(setting)
    session.commit()
    request.session["auth"] = True
    return {"ok": True}


@router.post("/auth/login")
def auth_login(body: PasswordBody, request: Request, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if not verify_password(body.password, setting.password_hash):
        raise HTTPException(status_code=401, detail="invalid password")
    request.session["auth"] = True
    return {"ok": True}


@router.post("/auth/logout")
def auth_logout(request: Request) -> dict:
    request.session.clear()
    return {"ok": True}


@router.post("/auth/change-password", dependencies=[Depends(require_auth)])
def change_password(body: ChangeBody, session: Session = Depends(get_session)) -> dict:
    setting = _get_setting(session)
    if not verify_password(body.current_password, setting.password_hash):
        raise HTTPException(status_code=400, detail="current password incorrect")
    setting.password_hash = hash_password(body.new_password)
    session.add(setting)
    session.commit()
    return {"ok": True}
```

- [ ] **Step 5: Wire middleware + guards in `backend/app/main.py`.** Replace the file with (preserving existing routers; ADD SessionMiddleware + protect data routers with `dependencies=[Depends(require_auth)]`; leave health + auth open):
```python
import secrets
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.api.accounts import router as accounts_router
from app.api.auth import require_auth
from app.api.auth import router as auth_router
from app.api.budgets import router as budgets_router
from app.api.categories import router as categories_router
from app.api.categorize import router as categorize_router
from app.api.dashboard import router as dashboard_router
from app.api.health import router as health_router
from app.api.imports import router as imports_router
from app.api.rules import router as rules_router
from app.api.transactions import router as transactions_router
from app.config import get_settings
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=get_settings().app_name, lifespan=lifespan)
# Signed-cookie sessions. A persistent SESSION_SECRET (set on the minipc) keeps
# logins valid across restarts; an empty one falls back to a per-process secret.
app.add_middleware(
    SessionMiddleware,
    secret_key=get_settings().session_secret or secrets.token_hex(32),
    same_site="lax",
    https_only=False,  # LAN-only HTTP
)

# Open endpoints
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")

# Protected endpoints (require an authenticated session)
_guard = [Depends(require_auth)]
app.include_router(accounts_router, prefix="/api", dependencies=_guard)
app.include_router(categories_router, prefix="/api", dependencies=_guard)
app.include_router(rules_router, prefix="/api", dependencies=_guard)
app.include_router(categorize_router, prefix="/api", dependencies=_guard)
app.include_router(imports_router, prefix="/api", dependencies=_guard)
app.include_router(transactions_router, prefix="/api", dependencies=_guard)
app.include_router(dashboard_router, prefix="/api", dependencies=_guard)
app.include_router(budgets_router, prefix="/api", dependencies=_guard)
```

- [ ] **Step 6: Update `backend/tests/conftest.py`** — make the `client` fixture authenticate (setup+login) so the existing 61 tests run as an authenticated user. In `client_fixture`, after entering the TestClient context and BEFORE yielding, add a setup call:
```python
    with TestClient(app) as client:
        client.post("/api/auth/setup", json={"password": "testpass"})
        yield client
```
(The TestClient persists the session cookie, so all subsequent requests in a test are authenticated. Add this single line; keep the rest of the fixture unchanged.)

- [ ] **Step 7: Write failing test** — `backend/tests/test_auth.py`:
```python
from fastapi.testclient import TestClient


def test_status_setup_login_logout_guard(client: TestClient):
    # the fixture already ran setup+login, so we're configured + authenticated
    s = client.get("/api/auth/status").json()
    assert s["configured"] is True
    assert s["authenticated"] is True

    # protected route works while authenticated
    assert client.get("/api/accounts").status_code == 200

    # log out -> protected route 401, health stays open
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/accounts").status_code == 401
    assert client.get("/api/health").status_code == 200

    # wrong password rejected, correct password logs back in
    assert client.post("/api/auth/login", json={"password": "nope"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "testpass"}).status_code == 200
    assert client.get("/api/accounts").status_code == 200


def test_change_password(client: TestClient):
    assert client.post(
        "/api/auth/change-password",
        json={"current_password": "testpass", "new_password": "newpass"},
    ).status_code == 200
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"password": "testpass"}).status_code == 401
    assert client.post("/api/auth/login", json={"password": "newpass"}).status_code == 200


def test_setup_blocked_once_configured(client: TestClient):
    # fixture already configured it
    assert client.post("/api/auth/setup", json={"password": "x"}).status_code == 400
```

- [ ] **Step 8: Run RED → GREEN** — `pytest -q tests/test_auth.py` (RED for missing pieces; implement; GREEN). Then FULL `pytest -q -W error::DeprecationWarning` → ALL green. The existing tests must still pass thanks to the conftest setup+login. Report.

- [ ] **Step 9: Commit:**
```bash
git add backend/requirements.txt backend/app/models.py backend/app/security.py backend/app/api/auth.py backend/app/main.py backend/tests/conftest.py backend/tests/test_auth.py
git commit -m "feat(api): single-password auth — setup/login/logout/change + route guard (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Frontend AuthGate (setup → login → app) (TDD)

**Files:** create `frontend/src/api/auth.ts`, `frontend/src/components/AuthGate.tsx`, `frontend/src/components/AuthGate.test.tsx`; modify `frontend/src/main.tsx` (wrap App in AuthGate); add a logout control to `frontend/src/components/Sidebar.tsx`.

- [ ] **Step 1: `frontend/src/api/auth.ts`:**
```typescript
import { api } from "./client";

export interface AuthStatus {
  configured: boolean;
  authenticated: boolean;
}

export const authStatus = () => api<AuthStatus>("/auth/status");
export const authSetup = (password: string) =>
  api<{ ok: boolean }>("/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
export const authLogin = (password: string) =>
  api<{ ok: boolean }>("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
export const authLogout = () => api<{ ok: boolean }>("/auth/logout", { method: "POST" });
export const changePassword = (current_password: string, new_password: string) =>
  api<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password, new_password }),
  });
```

- [ ] **Step 2: Write failing test** — `frontend/src/components/AuthGate.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as authApi from "../api/auth";
import AuthGate from "./AuthGate";

vi.mock("../api/auth");

beforeEach(() => vi.clearAllMocks());

test("renders children when authenticated", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: true, authenticated: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  expect(await screen.findByText("SECRET APP")).toBeInTheDocument();
});

test("shows login when configured but not authenticated, then unlocks", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: true, authenticated: false });
  vi.mocked(authApi.authLogin).mockResolvedValue({ ok: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  const pw = await screen.findByLabelText(/password/i);
  await userEvent.type(pw, "hunter2");
  await userEvent.click(screen.getByRole("button", { name: /log in/i }));
  await waitFor(() => expect(vi.mocked(authApi.authLogin)).toHaveBeenCalledWith("hunter2"));
  expect(await screen.findByText("SECRET APP")).toBeInTheDocument();
});

test("shows setup when not configured", async () => {
  vi.mocked(authApi.authStatus).mockResolvedValue({ configured: false, authenticated: false });
  vi.mocked(authApi.authSetup).mockResolvedValue({ ok: true });
  render(<AuthGate><div>SECRET APP</div></AuthGate>);
  expect(await screen.findByText(/set a password/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Write `frontend/src/components/AuthGate.tsx`** — on mount call `authStatus()`. While loading show nothing/spinner. If `!configured` show a "Set a password" form (calls `authSetup`, then re-checks status → authenticated → children). If `configured && !authenticated` show a "Log in" form (label "Password", button "Log in", calls `authLogin`, on success set authenticated → children; on error show message). If authenticated, render `children`. Keep a local `authed` state updated after setup/login so children show without a full reload. Centered card layout, slate theme.

- [ ] **Step 4: Wrap the app** — in `frontend/src/main.tsx`, wrap `<App />` with `<AuthGate>` (inside `<BrowserRouter>`):
```typescript
import AuthGate from "./components/AuthGate";
// ...
<BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  <AuthGate>
    <App />
  </AuthGate>
</BrowserRouter>
```

- [ ] **Step 5: Add a logout control to `Sidebar.tsx`** — at the bottom of the `<aside>`, a small "Log out" button that calls `authLogout()` then `window.location.reload()`. (Import `authLogout` from `../api/auth`.) Keep it visually subtle.

- [ ] **Step 6: Run GREEN** — `cd frontend && npm run test -- AuthGate` then full `npm run test && npm run typecheck && npm run build` → all pass. (App.test renders `<App/>` directly, not through AuthGate, so it's unaffected.) Report.

- [ ] **Step 7: Commit:**
```bash
git add frontend/src/api/auth.ts frontend/src/components/AuthGate.tsx frontend/src/components/AuthGate.test.tsx frontend/src/main.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(web): AuthGate (setup -> login -> app) + sidebar logout (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Settings page (change password) (TDD)

**Files:** create `frontend/src/pages/Settings.tsx`, `frontend/src/pages/Settings.test.tsx`; wire `/settings` route in `frontend/src/App.tsx`.

- [ ] **Step 1: Write failing test** — `frontend/src/pages/Settings.test.tsx`:
```typescript
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import * as authApi from "../api/auth";
import Settings from "./Settings";

vi.mock("../api/auth");
beforeEach(() => vi.clearAllMocks());

test("changes the password", async () => {
  vi.mocked(authApi.changePassword).mockResolvedValue({ ok: true });
  render(<Settings />);
  await userEvent.type(screen.getByLabelText(/current password/i), "old");
  await userEvent.type(screen.getByLabelText(/new password/i), "new");
  await userEvent.click(screen.getByRole("button", { name: /change password/i }));
  await waitFor(() => expect(vi.mocked(authApi.changePassword)).toHaveBeenCalledWith("old", "new"));
  expect(await screen.findByText(/password changed/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run RED** — `npm run test -- Settings` → FAIL.

- [ ] **Step 3: Write `frontend/src/pages/Settings.tsx`** — a "Change password" form with `Current password` + `New password` inputs (type=password, aria-labels) and a "Change password" button calling `changePassword(current, new)`; on success show "Password changed." and clear the fields; on error show the message. Slate theme, consistent with other pages.

- [ ] **Step 4: Wire the route** — in `frontend/src/App.tsx`, import `Settings` and change `/settings` from `<ComingSoon title="Settings" />` to `<Settings />`.

- [ ] **Step 5: Run GREEN** — `npm run test -- Settings` then full `npm run test && npm run typecheck && npm run build` → all pass.

- [ ] **Step 6: Commit:**
```bash
git add frontend/src/pages/Settings.tsx frontend/src/pages/Settings.test.tsx frontend/src/App.tsx
git commit -m "feat(web): Settings page — change password (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Verify + deploy + secure setup

- [ ] **Step 1:** Full backend + frontend tests green; typecheck + build.
- [ ] **Step 2:** Secrets audit + compose validate.
- [ ] **Step 3: Set a persistent SESSION_SECRET on the minipc** (so logins survive restarts) — BEFORE deploy, ensure `.env` on the minipc has a non-empty `SESSION_SECRET`:
```bash
ssh minipc "cd /home/aman/spendanalyzer && grep -q '^SESSION_SECRET=.\\+' .env || sed -i 's/^SESSION_SECRET=.*/SESSION_SECRET='\"$(openssl rand -hex 32)\"'/' .env && grep '^SESSION_SECRET=' .env | sed 's/=.*/=<set>/'"
```
(If `SESSION_SECRET=` is empty it gets a random 32-byte hex; if already set, left alone. Do NOT print the secret value.)
- [ ] **Step 4:** Merge to `main`, then `./scripts/deploy.sh`. The new `authsetting` table is created by `create_all`.
- [ ] **Step 5: Verify live** —
  - `ssh minipc "curl -fs http://localhost:8090/api/auth/status"` → `{"configured":false,"authenticated":false}` (no password set yet).
  - `ssh minipc "curl -fs -o /dev/null -w '%{http_code}\n' http://localhost:8090/api/accounts"` → **401** (data is now protected!).
  - `ssh minipc "curl -fs http://localhost:8090/api/health"` → still `{"status":"ok"}` (open).
  - Open `http://192.168.0.100:8090` in a browser → the **Set a password** screen appears. (Do NOT set a password from the CLI — the USER sets it in the browser on first visit.)
- [ ] **Step 6: Report** — Phase 6a auth live; the app now requires a password; the user sets it on first browser visit. Proceed to Phase 6b (watched-folder + polish).

---

## Self-Review
- **Security:** pbkdf2-salted hash in DB; signed-cookie session; data routers 401 without auth; health + auth open. ✓
- **First-run UX:** no env secret needed for the password — user sets it in the browser; SESSION_SECRET (cookie signing) set persistently on the minipc. ✓
- **Existing tests:** conftest auto-setup+login keeps all 61 prior tests green (run as authenticated). ✓
- **Change password:** verifies current, requires auth. ✓
- **Privacy:** password never leaves the minipc; only a salted hash stored. ✓
- **Deferred:** watched-folder, broader settings (6b). ✓
```
