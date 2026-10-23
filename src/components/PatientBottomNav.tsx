import { NavLink, useLocation } from "react-router"
import {
  mySlipDestination,
  patientNavItems,
  shouldShowPatientBottomNav,
} from "../navigation/patientNav.ts"
import { loadSlip } from "../lib/slipStorage.ts"
import { useMessages } from "../preferences/usePreferences.ts"
import {
  IconHome,
  IconPlace,
  IconSettings,
  IconSlip,
} from "./icons.tsx"

export function PatientBottomNav() {
  const messages = useMessages()
  const { pathname } = useLocation()

  if (!shouldShowPatientBottomNav(pathname)) {
    return null
  }

  const slipTo = mySlipDestination(loadSlip() !== null)
  const labels = {
    home: messages.home,
    find: messages.findPlace,
    myTurn: messages.myTurnNav,
    settings: messages.settings,
  } as const

  const icons = {
    home: IconHome,
    find: IconPlace,
    myTurn: IconSlip,
    settings: IconSettings,
  } as const

  return (
    <nav className="bottom-nav" aria-label={messages.bottomNav}>
      <div className="bottom-nav-inner">
        {patientNavItems.slice(0, 2).map((item) => {
          const Icon = icons[item.id]
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                isActive || item.match(pathname)
                  ? "bottom-nav-item is-active"
                  : "bottom-nav-item"
              }
              end={item.to === "/"}
            >
              <Icon className="bottom-nav-icon" />
              <span>{labels[item.id]}</span>
            </NavLink>
          )
        })}

        <NavLink
          to={slipTo}
          className={() =>
            pathname === "/slip" ? "bottom-nav-slip is-active" : "bottom-nav-slip"
          }
          aria-label={messages.mySlip}
        >
          <span className="bottom-nav-slip-button">
            <IconSlip className="bottom-nav-slip-icon" />
            <span className="bottom-nav-slip-label">{messages.mySlip}</span>
          </span>
        </NavLink>

        {patientNavItems.slice(2).map((item) => {
          const Icon = icons[item.id]
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                isActive || item.match(pathname)
                  ? "bottom-nav-item is-active"
                  : "bottom-nav-item"
              }
            >
              <Icon className="bottom-nav-icon" />
              <span>{labels[item.id]}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
