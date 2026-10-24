import { useEffect, useRef, useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import {
  loadIdempotentRegistration,
  saveIdempotentRegistration,
} from "../domain/agent/registrationDraft.ts"
import {
  isRegisterPatientResponse,
  mapRegisterFailure,
  withRegisterTimeout,
} from "../domain/registerOutcome.ts"
import { localizedDepartmentName } from "../domain/departmentLabels.ts"
import { validateRegistrationInput } from "../domain/registration.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import {
  registerPatient,
  type RegisterPatientResponse,
} from "../lib/supabase/patientApi.ts"
import { loadSlip, saveSlip } from "../lib/slipStorage.ts"
import { useMessages, usePreferences } from "../preferences/usePreferences.ts"

type DepartmentOption = {
  code: string
  name_en: string
  name_hi: string
}

export function RegisterPage() {
  const messages = useMessages()
  const { preferences } = usePreferences()
  const navigate = useNavigate()
  const supabaseState = readSupabaseState(import.meta.env)
  const client = getSupabaseClient()
  const idempotencyKeyRef = useRef(
    crypto.randomUUID().replaceAll("-", ""),
  )
  const existingSlip = loadSlip()
  const [departments, setDepartments] = useState<DepartmentOption[]>([])
  const [displayName, setDisplayName] = useState("")
  const [ageText, setAgeText] = useState("")
  const [gender, setGender] = useState("")
  const [departmentCode, setDepartmentCode] = useState("")
  const [loadingDepartments, setLoadingDepartments] = useState(
    supabaseState.status === "ready",
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)

  useEffect(() => {
    if (supabaseState.status !== "ready" || !client) {
      return
    }
    const supabase = client
    let cancelled = false
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("departments")
        .select("code, name_en, name_hi")
        .eq("active", true)
        .order("display_order")
      if (cancelled) {
        return
      }
      if (loadError) {
        setError(messages.registerLoadError)
        setLoadingDepartments(false)
        return
      }
      const rows = (data ?? []) as DepartmentOption[]
      setDepartments(rows)
      setDepartmentCode((current) => current || rows[0]?.code || "")
      setLoadingDepartments(false)
    })()
    return () => {
      cancelled = true
    }
  }, [client, messages.registerLoadError, supabaseState.status])

  function finishWithSlip(data: RegisterPatientResponse) {
    saveSlip(data)
    saveIdempotentRegistration(idempotencyKeyRef.current, data)
    navigate("/slip", { replace: true, state: { slip: data } })
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) {
      return
    }
    setError(null)
    setShowRecovery(false)

    if (supabaseState.status === "unconfigured") {
      setError(messages.backendUnconfigured)
      return
    }
    if (supabaseState.status === "refused") {
      setError(messages.backendRefusedKey)
      return
    }
    if (!client) {
      setError(messages.backendUnconfigured)
      return
    }

    const cached = loadIdempotentRegistration(idempotencyKeyRef.current)
    if (cached && isRegisterPatientResponse(cached.response)) {
      finishWithSlip(cached.response)
      return
    }

    const existing = loadSlip()
    if (existing) {
      navigate("/slip", { replace: true, state: { slip: existing } })
      return
    }

    const parsed = validateRegistrationInput({
      displayName,
      ageText,
      gender,
      departmentCode,
    })
    if (!parsed.ok) {
      setError(fieldError(parsed.field, messages))
      return
    }

    setSubmitting(true)
    const raced = await withRegisterTimeout(
      registerPatient(client, {
        display_name: parsed.value.displayName,
        age: parsed.value.age,
        gender: parsed.value.gender,
        department_code: parsed.value.departmentCode,
      }),
    )
    setSubmitting(false)

    if (!raced.ok) {
      const recovered = loadSlip()
      if (recovered) {
        navigate("/slip", { replace: true, state: { slip: recovered } })
        return
      }
      const again = loadIdempotentRegistration(idempotencyKeyRef.current)
      if (again && isRegisterPatientResponse(again.response)) {
        finishWithSlip(again.response)
        return
      }
      const mapped = mapRegisterFailure({
        invokeError: null,
        timedOut: true,
        messages,
      })
      setError(mapped.message)
      setShowRecovery(true)
      return
    }

    const { data, error: registerError } = raced.value

    if (registerError || !data) {
      const mapped = mapRegisterFailure({
        invokeError: registerError,
        messages,
      })
      setError(mapped.message)
      setShowRecovery(mapped.kind === "network" || mapped.kind === "uncertain")
      return
    }

    if (typeof data === "object" && data !== null && "error" in data) {
      const mapped = mapRegisterFailure({
        invokeError: null,
        bodyError: String((data as { error: string }).error),
        messages,
      })
      setError(mapped.message)
      return
    }

    if (!isRegisterPatientResponse(data)) {
      setError(messages.registerFailed)
      return
    }

    finishWithSlip(data)
  }

  return (
    <>
      <PageHeading title={messages.registerTitle}>
        <p>{messages.registerDemoOnly}</p>
      </PageHeading>

      {existingSlip ? (
        <p className="panel" role="status">
          {messages.registerAlreadyHaveSlip}{" "}
          <Link to="/slip">{messages.mySlip}</Link>
        </p>
      ) : null}

      {supabaseState.status === "unconfigured" ? (
        <p className="form-error" role="status">
          {messages.backendUnconfigured}
        </p>
      ) : null}
      {supabaseState.status === "refused" ? (
        <p className="form-error" role="alert">
          {messages.backendRefusedKey}
        </p>
      ) : null}

      <form className="panel settings-form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span>{messages.displayNameLabel}</span>
          <input
            name="display_name"
            autoComplete="name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            required
          />
        </label>
        <label className="field">
          <span>{messages.ageLabel}</span>
          <input
            name="age"
            inputMode="numeric"
            value={ageText}
            onChange={(event) => setAgeText(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>{messages.genderLabel}</span>
          <select
            name="gender"
            value={gender}
            onChange={(event) => setGender(event.target.value)}
          >
            <option value="">{messages.genderOptional}</option>
            <option value="female">{messages.genderFemale}</option>
            <option value="male">{messages.genderMale}</option>
            <option value="other">{messages.genderOther}</option>
          </select>
        </label>
        <label className="field">
          <span>{messages.departmentLabel}</span>
          <select
            name="department"
            value={departmentCode}
            onChange={(event) => setDepartmentCode(event.target.value)}
            disabled={loadingDepartments || departments.length === 0}
            required
          >
            {departments.length === 0 ? (
              <option value="">{messages.notAvailable}</option>
            ) : (
              departments.map((department) => (
                <option key={department.code} value={department.code}>
                  {localizedDepartmentName(
                    messages,
                    preferences.language,
                    department,
                  )}
                </option>
              ))
            )}
          </select>
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {showRecovery ? (
          <div className="choice-row staff-actions">
            <Link className="button button-secondary" to="/slip">
              {messages.mySlip}
            </Link>
            <Link className="button button-secondary" to="/my-turn">
              {messages.myTurn}
            </Link>
          </div>
        ) : null}
        <button
          type="submit"
          className="button"
          disabled={
            submitting ||
            loadingDepartments ||
            supabaseState.status !== "ready" ||
            departments.length === 0
          }
        >
          {submitting ? messages.registerSubmitting : messages.registerSubmit}
        </button>
        <p className="privacy-note">{messages.registerEstimateHint}</p>
      </form>
    </>
  )
}

function fieldError(
  field: string,
  messages: ReturnType<typeof useMessages>,
): string {
  switch (field) {
    case "name":
      return messages.registerInvalidName
    case "age":
      return messages.registerInvalidAge
    case "gender":
      return messages.registerInvalidGender
    case "department":
      return messages.registerInvalidDepartment
    default:
      return messages.registerFailed
  }
}
