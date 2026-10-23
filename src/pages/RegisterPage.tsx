import { useEffect, useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { PageHeading } from "../components/PageHeading.tsx"
import { validateRegistrationInput } from "../domain/registration.ts"
import {
  getSupabaseClient,
  readSupabaseState,
} from "../lib/supabase/client.ts"
import { supabaseErrorMessage } from "../lib/supabase/errors.ts"
import { registerPatient } from "../lib/supabase/patientApi.ts"
import { saveSlip } from "../lib/slipStorage.ts"
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
        setError(supabaseErrorMessage(loadError, messages.registerLoadError))
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

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
    const { data, error: registerError } = await registerPatient(client, {
      display_name: parsed.value.displayName,
      age: parsed.value.age,
      gender: parsed.value.gender,
      department_code: parsed.value.departmentCode,
    })
    setSubmitting(false)

    if (registerError || !data) {
      setError(
        supabaseErrorMessage(registerError, messages.registerFailed),
      )
      return
    }

    if (typeof data === "object" && data !== null && "error" in data) {
      setError(String((data as { error: string }).error))
      return
    }

    saveSlip(data)
    navigate("/slip", { replace: true, state: { slip: data } })
  }

  return (
    <>
      <PageHeading title={messages.registerTitle}>
        <p>{messages.registerDemoOnly}</p>
        <p>{messages.registerNoPhone}</p>
      </PageHeading>

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
            <option value="undisclosed">{messages.genderUndisclosed}</option>
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
                  {preferences.language === "hi"
                    ? department.name_hi
                    : department.name_en}
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
        <p>{messages.registerEstimateHint}</p>
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
