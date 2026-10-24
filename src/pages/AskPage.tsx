import { useId, useRef } from "react"
import { useNavigate } from "react-router"
import { AssistantChat } from "../components/AssistantChat.tsx"
import { configuredDepartmentFacts } from "../domain/voice/departmentFacts.ts"
import { useAssistantContext } from "../preferences/AssistantContext.tsx"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

/**
 * First-class Ask AI destination — full conversational assistant
 * without a redundant floating FAB on this route.
 */
export function AskPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const assistant = useAssistantContext()
  const navigate = useNavigate()
  const titleId = useId()
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const departments =
    assistant.departments.length > 0
      ? assistant.departments
      : configuredDepartmentFacts(messages)

  return (
    <div className="ask-page">
      <AssistantChat
        language={preferences.language}
        token={assistant.token}
        departments={departments}
        routeMode={assistant.route?.routeMode ?? "assisted"}
        startId={assistant.route?.startId ?? "entrance"}
        titleId={titleId}
        onClose={() => navigate(-1)}
        closeButtonRef={closeButtonRef}
        fullPage
      />
    </div>
  )
}
