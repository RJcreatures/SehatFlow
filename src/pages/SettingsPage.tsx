import { useState } from "react"
import { readyLanguages } from "../i18n/index.ts"
import { PageHeading } from "../components/PageHeading.tsx"
import {
  getNotificationSupport,
  requestNotificationPermission,
} from "../lib/browserNotifications.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"
import type { ContrastMode, TextSize } from "../preferences/types.ts"

export function SettingsPage() {
  const messages = useMessages()
  const {
    preferences,
    setLanguage,
    setTextSize,
    setContrast,
    setQueueNotificationsEnabled,
    setSimulatedCallEnabled,
    resetOnboarding,
  } = usePreferences()
  const [notifyNote, setNotifyNote] = useState<string | null>(null)

  const sizes: Array<{ id: TextSize; label: string }> = [
    { id: "md", label: messages.textMd },
    { id: "lg", label: messages.textLg },
    { id: "xl", label: messages.textXl },
  ]
  const contrasts: Array<{ id: ContrastMode; label: string }> = [
    { id: "default", label: messages.contrastDefault },
    { id: "high", label: messages.contrastHigh },
  ]

  const notifySupport = getNotificationSupport()

  async function enableNotifications() {
    setNotifyNote(null)
    const permission = await requestNotificationPermission()
    if (permission === "unsupported") {
      setNotifyNote(messages.notifyUnsupported)
      setQueueNotificationsEnabled(false)
      return
    }
    if (permission !== "granted") {
      setNotifyNote(messages.notifyDenied)
      setQueueNotificationsEnabled(false)
      return
    }
    setQueueNotificationsEnabled(true)
    setNotifyNote(messages.notifyEnabledConfirm)
  }

  function disableNotifications() {
    setQueueNotificationsEnabled(false)
    setNotifyNote(messages.notifyDisabledConfirm)
  }

  return (
    <>
      <PageHeading title={messages.settingsTitle}>
        <p>{messages.savedOnDevice}</p>
      </PageHeading>
      <form className="settings-form">
        <fieldset className="settings-group">
          <legend>{messages.language}</legend>
          <div className="language-grid" role="list">
            {readyLanguages().map((language) => (
              <button
                key={language.id}
                type="button"
                role="listitem"
                className={
                  preferences.language === language.id
                    ? "choice language-chip is-selected"
                    : "choice language-chip"
                }
                onClick={() => setLanguage(language.id)}
              >
                {language.nativeName}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="settings-group">
          <legend>{messages.textSize}</legend>
          {sizes.map((size) => (
            <label className="radio-row" key={size.id}>
              <input
                type="radio"
                name="text-size"
                value={size.id}
                checked={preferences.textSize === size.id}
                onChange={() => setTextSize(size.id)}
              />
              <span>{size.label}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="settings-group">
          <legend>{messages.contrast}</legend>
          {contrasts.map((mode) => (
            <label className="radio-row" key={mode.id}>
              <input
                type="radio"
                name="contrast"
                value={mode.id}
                checked={preferences.contrast === mode.id}
                onChange={() => setContrast(mode.id)}
              />
              <span>{mode.label}</span>
            </label>
          ))}
        </fieldset>

        <fieldset className="settings-group">
          <legend>{messages.notifySettingsLegend}</legend>
          <p>{messages.notifySettingsExplain}</p>
          {!notifySupport.supported ? (
            <p role="status">{messages.notifyUnsupported}</p>
          ) : preferences.queueNotificationsEnabled ? (
            <button
              type="button"
              className="button button-secondary"
              onClick={disableNotifications}
            >
              {messages.notifyDisable}
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => void enableNotifications()}
            >
              {messages.notifyEnable}
            </button>
          )}
          {notifyNote ? (
            <p role="status">{notifyNote}</p>
          ) : null}
        </fieldset>

        <fieldset className="settings-group">
          <legend>{messages.simCallSettingsLegend}</legend>
          <p className="forecast-banner" role="status">
            {messages.simCallDemoBanner}
          </p>
          <label className="radio-row">
            <input
              type="checkbox"
              checked={preferences.simulatedCallEnabled}
              onChange={(event) =>
                setSimulatedCallEnabled(event.target.checked)
              }
            />
            <span>{messages.simCallOptIn}</span>
          </label>
        </fieldset>

        <fieldset className="settings-group">
          <legend>{messages.onboardingResetLegend}</legend>
          <p>{messages.onboardingResetHint}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => resetOnboarding()}
          >
            {messages.onboardingReset}
          </button>
        </fieldset>
      </form>
    </>
  )
}
