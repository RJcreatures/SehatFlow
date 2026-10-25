import { useEffect } from "react"
import { Link, Outlet, useLocation } from "react-router"
import { ensureDemoQueueOnce } from "../lib/supabase/ensureDemo.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { AppBrand } from "./AppBrand.tsx"
import { EmergencyBar } from "./EmergencyBar.tsx"
import { GlobalAssistant } from "./GlobalAssistant.tsx"
import { OnboardingFlow } from "./OnboardingFlow.tsx"
import { PatientBottomNav } from "./PatientBottomNav.tsx"
import { RenderErrorBoundary } from "./RenderErrorBoundary.tsx"
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

  useEffect(() => {
    void ensureDemoQueueOnce()
  }, [])

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
          <Link className="choice" to="/staff">
            {messages.staffTitle}
          </Link>
          {showOnboarding ? null : (
            <Link className="choice" to="/settings">
              {messages.settings}
            </Link>
          )}
        </div>
      </header>
      {showPatientChrome ? <WaitIndicator /> : null}
      <main id="main" className="main">
        <RenderErrorBoundary
          fallback={(_error, retry) => (
            <section className="panel" role="alert">
              <p>{messages.slipRenderError}</p>
              <div className="choice-row">
                <button type="button" className="button" onClick={retry}>
                  {messages.qrRetry}
                </button>
                <Link className="button button-secondary" to="/">
                  {messages.home}
                </Link>
              </div>
            </section>
          )}
        >
          {showOnboarding ? <OnboardingFlow /> : <Outlet />}
        </RenderErrorBoundary>
      </main>
      {showPatientChrome ? <PatientBottomNav /> : null}
      <GlobalAssistant />
    </div>
  )
}
