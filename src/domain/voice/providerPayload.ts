import type { UiLanguage } from "../../i18n/index.ts"

const INTENT_SYSTEM = `You classify patient questions for a fictional hospital outpatient demo app.
Return ONLY a JSON object with keys:
intent, department_code, destination_code, start_landmark, confidence.

intent must be one of:
current_token, wait_estimate, department_info, accessible_route, emergency, app_help, registration_help, unknown

Use app_help when the patient asks how SehatFlow or this demo hospital app works.
Use registration_help when they ask how to register, get a token, or recover a token/slip.

department_code and destination_code must be one of these or null:
general_medicine, pediatrics, womens_health, orthopedics, ent, ophthalmology, dermatology

start_landmark must be one of these graph ids or null:
entrance, opd_entrance, registration, opd_reception, waiting_area, help_desk, lift_g, ramp_g, water_station, washroom_g, pharmacy, laboratory

Use accessible_route for directions, facilities (washroom, water, lab, pharmacy), or department locations.
Use wait_estimate for how long until turn or people ahead.
Use current_token for token number or queue status.

confidence is a number from 0 to 1.
Do not invent rooms, medical advice, diagnoses, or hospital policies.
If unsure, use intent "unknown" with null codes.
Never include personal data, tokens, or access codes in the JSON.`

/** Lowest-cost chat model on Sarvam (MiMo V2.6 Flash). Keep max_tokens tight for JSON intents. */
export const INTENT_CHAT_MODEL = "mimo-v2.6-flash" as const

/** Chat body sent to Sarvam — transcript only, never slip credentials. */
export function buildIntentChatBody(transcript: string, language: UiLanguage) {
  const safeTranscript = transcript.slice(0, 280)
  return {
    model: INTENT_CHAT_MODEL,
    temperature: 0,
    max_tokens: 96,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: INTENT_SYSTEM },
      {
        role: "user" as const,
        content: `lang=${language}\n${safeTranscript}`,
      },
    ],
  }
}

export function speakTextLooksLikeCredential(text: string): boolean {
  return /access[_\s-]?code|qr[_\s-]?token/i.test(text)
}
