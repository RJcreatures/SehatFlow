import { Link, Outlet, useLocation } from "react-router"
import { appConfig } from "../config/hospital.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { EmergencyBar } from "./EmergencyBar.tsx"
import { LanguageSwitch } from "./LanguageSwitch.tsx"
import { OnboardingFlow } from "./OnboardingFlow.tsx"
import { PatientBottomNav } from "./PatientBottomNav.tsx"
import { WaitIndicator } from "./WaitIndicator.tsx"

export function PatientLayout() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { pathname } = useLocation()
  const showOnboarding = !preferences.onboardingCompleted

  return (
    <div
      className={
        showOnboarding
          ? "app-shell"
          : "app-shell app-shell-with-bottom-nav app-shell-with-wait"
      }
    >
      <a className="skip-link" href="#main">
        {messages.skipToContent}
      </a>
      <EmergencyBar />
      <header className="topbar">
        <div className="brand-block">
          <Link className="brand" to="/">
            {appConfig.name}
          </Link>
          <p className="hospital" lang={preferences.language}>
            {messages.hospitalName}
          </p>
        </div>
        <div className="topbar-actions">
          {showOnboarding ? null : <LanguageSwitch />}
          {showOnboarding ? null : (
            <Link className="choice" to="/settings">
              {messages.settings}
            </Link>
          )}
        </div>
      </header>
      {showOnboarding || pathname === "/emergency" ? null : <WaitIndicator />}
      <main id="main" className="main">
        {showOnboarding ? <OnboardingFlow /> : <Outlet />}
      </main>
      {showOnboarding || pathname === "/emergency" ? null : <PatientBottomNav />}
    </div>
  )
}
