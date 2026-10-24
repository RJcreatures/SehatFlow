import { Link, Outlet, useLocation } from "react-router"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { AppBrand } from "./AppBrand.tsx"
import { EmergencyBar } from "./EmergencyBar.tsx"
import { GlobalAssistant } from "./GlobalAssistant.tsx"
import { OnboardingFlow } from "./OnboardingFlow.tsx"
import { PatientBottomNav } from "./PatientBottomNav.tsx"
import { WaitIndicator } from "./WaitIndicator.tsx"

export function PatientLayout() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { pathname } = useLocation()
  const onboardingIncomplete = !preferences.onboardingCompleted
  const onEmergency = pathname === "/emergency"
  // Emergency must stay reachable before onboarding/registration completes.
  const showOnboarding = onboardingIncomplete && !onEmergency
  const showPatientChrome = !showOnboarding && !onEmergency

  return (
    <div
      className={
        showPatientChrome
          ? "app-shell app-shell-with-bottom-nav app-shell-with-wait"
          : "app-shell"
      }
    >
      <a className="skip-link" href="#main">
        {messages.skipToContent}
      </a>
      <EmergencyBar />
      <header className="topbar">
        <AppBrand
          to="/"
          subtitle={messages.hospitalName}
          subtitleLang={preferences.language}
        />
        <div className="topbar-actions">
          {showOnboarding ? null : (
            <Link className="choice" to="/settings">
              {messages.settings}
            </Link>
          )}
        </div>
      </header>
      {showPatientChrome ? <WaitIndicator /> : null}
      <main id="main" className="main">
        {showOnboarding ? <OnboardingFlow /> : <Outlet />}
      </main>
      {showPatientChrome ? <PatientBottomNav /> : null}
      <GlobalAssistant />
    </div>
  )
}
