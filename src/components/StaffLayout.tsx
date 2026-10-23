import { Link, NavLink, Outlet } from "react-router"
import { appConfig } from "../config/hospital.ts"
import { useMessages } from "../preferences/usePreferences.ts"
import { StaffAuthProvider } from "../staff/StaffAuthProvider.tsx"
import { useStaffAuth } from "../staff/useStaffAuth.ts"
import { LanguageSwitch } from "./LanguageSwitch.tsx"

function StaffChrome() {
  const messages = useMessages()
  const auth = useStaffAuth()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        {messages.skipToContent}
      </a>
      <header className="topbar">
        <div className="brand-block">
          <Link className="brand" to="/staff">
            {appConfig.name}
          </Link>
          <p className="hospital">{messages.staffTitle}</p>
        </div>
        <div className="topbar-actions">
          <LanguageSwitch />
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
