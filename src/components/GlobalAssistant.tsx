import { useEffect, useId, useRef, useState } from "react"
import { useLocation } from "react-router"
import { configuredDepartmentFacts } from "../domain/voice/departmentFacts.ts"
import { shouldShowGlobalAssistant } from "../navigation/globalAssistant.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { AssistantChat } from "./AssistantChat.tsx"

/**
 * Persistent patient-facing Ask SehatFlow entry.
 * Mounted once from PatientLayout — never on staff/board layouts.
 */
export function GlobalAssistant() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const { pathname } = useLocation()
  const assistant = useAssistantContext()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [panelPath, setPanelPath] = useState(pathname)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  const visible = shouldShowGlobalAssistant(pathname)

  if (panelPath !== pathname) {
    setPanelPath(pathname)
    if (open) {
      setOpen(false)
    }
  }

  const departments =
    assistant.departments.length > 0
      ? assistant.departments
      : configuredDepartmentFacts(messages)

  useEffect(() => {
    if (!open) {
      return
    }
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    return () => {
      window.clearTimeout(timer)
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open])

  if (!visible) {
    return null
  }

  return (
    <div className="global-assistant" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="global-assistant-fab"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? "global-assistant-dialog" : undefined}
        aria-label={messages.assistantFabLabel}
        onClick={() => setOpen(true)}
      >
        {messages.assistantFabLabel}
      </button>

      {open ? (
        <div className="global-assistant-layer">
          <button
            type="button"
            className="global-assistant-backdrop"
            aria-label={messages.assistantClose}
            onClick={() => setOpen(false)}
          />
          <div
            id="global-assistant-dialog"
            className="global-assistant-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <AssistantChat
              key={`chat-${pathname}`}
              language={preferences.language}
              token={assistant.token}
              departments={departments}
              routeMode={assistant.route?.routeMode ?? "assisted"}
              startId={assistant.route?.startId ?? "entrance"}
              titleId={titleId}
              onClose={() => setOpen(false)}
              closeButtonRef={closeButtonRef}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
