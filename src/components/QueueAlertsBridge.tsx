import { useCallback, useEffect, useRef, useState } from "react"
import { hasAlertBeenSent, markAlertSent } from "../domain/alertDedupe.ts"
import {
  decideQueueAlerts,
  shouldShowSimulatedCall,
  type QueueAlertSnapshot,
} from "../domain/queueAlerts.ts"
import {
  getNotificationSupport,
  showBrowserNotification,
} from "../lib/browserNotifications.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import { SimulatedCallModal } from "./SimulatedCallModal.tsx"

type QueueAlertsBridgeProps = {
  snapshot: QueueAlertSnapshot | null
}

/**
 * Side-effect bridge for opt-in browser notifications and the simulated call demo.
 * Driven by verified WaitIndicator snapshots — never invents patient data.
 */
export function QueueAlertsBridge({ snapshot }: QueueAlertsBridgeProps) {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const previousRef = useRef<QueueAlertSnapshot | null>(null)
  const [simCall, setSimCall] = useState<{ tokenCode: string } | null>(null)

  const process = useCallback(
    (next: QueueAlertSnapshot) => {
      const previous = previousRef.current

      if (preferences.queueNotificationsEnabled) {
        const support = getNotificationSupport()
        if (support.supported && support.permission === "granted") {
          for (const decision of decideQueueAlerts({
            previous,
            next,
            notificationsEnabled: true,
          })) {
            if (hasAlertBeenSent(decision.dedupeKey)) {
              continue
            }
            const title = messages[decision.titleKey]
            const body = messages[decision.bodyKey].replace(
              "{token}",
              next.tokenCode,
            )
            const result = showBrowserNotification({
              title,
              body,
              tag: decision.dedupeKey,
            })
            if (result.shown) {
              markAlertSent(decision.dedupeKey)
            }
          }
        }
      }

      const simKey = `simcall:${next.tokenCode}:called`
      const sim = shouldShowSimulatedCall({
        previousStatus: previous?.status ?? null,
        nextStatus: next.status,
        tokenCode: next.tokenCode,
        simulatedCallEnabled: preferences.simulatedCallEnabled,
        alreadyShownForKey: hasAlertBeenSent(simKey),
      })
      if (sim.show) {
        markAlertSent(sim.dedupeKey)
        setSimCall({ tokenCode: next.tokenCode })
      }

      previousRef.current = next
    },
    [
      messages,
      preferences.queueNotificationsEnabled,
      preferences.simulatedCallEnabled,
    ],
  )

  useEffect(() => {
    if (!snapshot) {
      previousRef.current = null
      return
    }
    process(snapshot)
  }, [snapshot, process])

  return (
    <SimulatedCallModal
      open={simCall !== null}
      tokenCode={simCall?.tokenCode ?? ""}
      onDismiss={() => setSimCall(null)}
    />
  )
}
