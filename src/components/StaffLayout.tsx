import { useEffect } from "react"
import { Link, NavLink, Outlet } from "react-router"
import { ensureDemoQueueOnce } from "../lib/supabase/ensureDemo.ts"
import { useMessages } from "../preferences/usePreferences.ts"
import { StaffAuthProvider } from "../staff/StaffAuthProvider.tsx"
import { useStaffAuth } from "../staff/useStaffAuth.ts"
import { AppBrand } from "./AppBrand.tsx"

function StaffChrome() {
  const messages = useMessages()
  const auth = useStaffAuth()

  useEffect(() => {
    void ensureDemoQueueOnce()
  }, [])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {messages.skipToContent}
      </a>
      <header className="topbar">
        <AppBrand to="/staff" subtitle={messages.staffTitle} />
        <div className="topbar-actions">
          {auth.status === "signed_in" ? (
            <button
              type="button"
              className="choice"
              onClick={() => void auth.signOut()}
              disabled={auth.busy}
            >
              {messages.signOut}
            </button>
          ) : null}
          <Link className="choice" to="/">
            {messages.home}
          </Link>
        </div>
      </header>
      <main id="main" className="main">
        <p className="status-line" role="status">
          {auth.status === "unconfigured"
            ? messages.backendUnconfigured
            : auth.status === "refused"
              ? messages.backendRefusedKey
              : auth.status === "signed_in"
                ? messages.connectedBackend
                : messages.staffTitle}
        </p>
        <nav className="choice-row" aria-label={messages.staffNav}>
          <NavLink
            to="/staff"
            end
            className={({ isActive }) => (isActive ? "choice is-selected" : "choice")}
          >
            {messages.dashboardLink}
          </NavLink>
          <NavLink
            to="/staff/forecast"
            className={({ isActive }) => (isActive ? "choice is-selected" : "choice")}
          >
            {messages.forecastLink}
          </NavLink>
        </nav>
        <Outlet />
      </main>
    </div>
  )
}

export function StaffLayout() {
  return (
    <StaffAuthProvider>
      <StaffChrome />
    </StaffAuthProvider>
  )
}
