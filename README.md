# SahaayOPD

Fictional government-hospital outpatient queue for a hackathon demonstration. The hospital in this demo is Nagar Civil Hospital. Nothing here is connected to a real hospital.

Phase 1 is the accessible shell. Phase 2 is the schema and RLS. Phase 3 adds the queue engine, staff dashboard, waiting-room board, 20-patient demo reset, and a shared 1×/10× demo clock. Phase 4 adds patient registration, a printed slip with a one-time access code, and My Turn lookup through Edge Functions.

## Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project you control, to use staff login and the live queue
- Docker and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), only if you want local database tests

## Install and run

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite interface at `http://127.0.0.1:5173`. It does not run Vercel Functions or Supabase.

Without Supabase settings, the patient shell still loads. Staff and board screens say the backend is unconfigured. They do not invent a live queue.

## Check and build

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run preview
```

Database tests, when Docker and the Supabase CLI are available:

```bash
npx supabase start
npx supabase test db
```

That applies both migrations and runs `supabase/tests`. It is not hosted verification.

## Environment

Copy `.env.example` to `.env` only on your machine.

| Name | Where it is used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser. Project URL only. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser. Publishable key, or the legacy anon key. |
| `SARVAM_API_KEY` | Not used yet. Future server function only. |

Never put a `service_role` key, secret key, or database password in a `VITE_` variable. The client refuses privileged keys.

## Supabase setup for Phase 3

These hosted steps were not executed in this workspace.

1. Create a Supabase project and turn off public sign-ups.
2. Keep `private` out of the Data API exposed schemas.
3. Apply both migrations:
   - `supabase/migrations/20261022155254_phase2_foundation.sql`
   - `supabase/migrations/20261022160700_phase3_queue_engine.sql`
   - CLI: `npx supabase db push`, or run them in order in the SQL editor.
4. Put the project URL and publishable/anon key in `.env`.
5. Create a staff Auth user in the dashboard. Do not add a public registration form.
6. Provision membership from the SQL editor (no `auth.uid()` in that session):

```sql
insert into public.staff_members (user_id, display_name, role, active)
values ('00000000-0000-4000-8000-000000000000', 'Demo Manager', 'queue_manager', true);
```

Allowed roles: `admin`, `registrar`, `doctor`, `queue_manager`.

7. Sign in at `/staff`, then use **Reset fictional demo** to load exactly 20 demo patients.
8. Open `/board` for the public waiting-room display. It calls `get_board_snapshot()` only.

## Phase 4 registration and My Turn

1. Apply the remaining migrations (do not reset the database):
   - `20261023073151_phase4_patient_registration_access_codes.sql` (already applied on the linked project)
   - `20261023081839_phase4_access_code_vault_and_lookup.sql` (moves hashes into `private.queue_access_codes` and adds `lookup_my_turn`)
2. Deploy Edge Functions:

```bash
npx supabase functions deploy register-patient --project-ref hhvgkwulxgfuhhucmmyt
npx supabase functions deploy get-my-turn --project-ref hhvgkwulxgfuhhucmmyt
```

3. Keep `verify_jwt = false` for those two functions in `supabase/config.toml`. They accept the publishable key from the browser and use the platform service role only inside the function.
4. Browser `.env` still needs only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Register at `/register`, read the slip at `/slip`, then check `/my-turn` with token + access code.

Access-code hashes are stored only in `private.queue_access_codes`. The raw access code is returned once at registration and kept in `sessionStorage` for that browser tab. Staff table reads never include the hash.

### Slip QR codes (Stage 2)

Registration also creates a single-purpose QR lookup token. Only the SHA-256 hash is stored in `private.queue_qr_tokens`, with expiry at service-date midnight + 36 hours. The raw token is returned once and encoded as:

`{VITE_PUBLIC_APP_URL or current origin}/my-turn?q={qr_token}`

Scanning opens My Turn, which strips `q` from the URL and calls `get-my-turn` with `{ qr_token }`. Access-code lookup remains available. Set `VITE_PUBLIC_APP_URL` to the deployed HTTPS origin so printed QR codes do not point at localhost.

### Live wait indicator

While a slip is saved in the tab, patient pages show a sticky approximate-wait bar driven by `get-my-turn` (about every 45 seconds, plus focus/visibility refresh). Local countdown uses elapsed wall time from the last *changed* server estimate and does not reset on identical polls.

### Role permissions (enforced in PostgreSQL)

| Action | admin | queue_manager | doctor | registrar |
| --- | --- | --- | --- | --- |
| Read operational tables | yes | yes | yes | yes |
| Call next | yes | yes | no | no |
| Complete called token | yes | yes | yes | no |
| Mark no-show | yes | yes | no | no |
| Send skipped/no-show to end | yes | yes | no | no |
| Reassign department | yes | yes | no | no |
| Set doctor status | yes | yes | yes | no |
| Acknowledge urgent flag | yes | yes | no | no |
| Reset demo / set 10× clock | yes | yes | no | no |
| Public board snapshot | yes (and anon) | yes | yes | yes |

Hiding buttons in React is not authorization. Each RPC checks an active `staff_members` row and role.

### Demo clock

`demo_clock` stores `scale` (1 or 10), `real_anchor`, and `sim_anchor`.

`simulated_now = sim_anchor + (wall_now - real_anchor) * scale`

Queue timestamps, break ends, service date, and wait estimates use that clock. Staff actions still change token status; the clock does not auto-complete patients.

Wait estimates use `peopleAhead * meanDuration + delay + break`. Mean duration is the median of up to ten recent **completed** consultations whose length is in **[1, 60] minutes**. Samples outside that range (for example a token left “called” too long, or a 10× clock stretch) are ignored. If no valid samples remain, the department’s `estimated_minutes` is used. Cancelled, skipped, and no-show entries never contribute to the mean.

### Public board safety

`/board` polls `get_board_snapshot()`. The function returns department names, room/floor, called token, next three waiting tokens, doctor availability, and an estimated wait. It does not return patient names, ages, `patient_id`, staff ids, urgent-flag details, or queue events. Anonymous clients still cannot `select` private tables.

## Manual hosted checklist

None of these was run against a hosted project from this workspace.

- [ ] Anonymous `select` on `patients`, `queue_entries`, `staff_members`, `urgent_flags`, and `queue_events` is denied.
- [ ] Anonymous `get_board_snapshot()` returns seven department rows with token codes only.
- [ ] Anonymous `call_next` / `reset_demo` are denied.
- [ ] Authenticated non-staff cannot call staff RPCs.
- [ ] Registrar can read the dashboard data and cannot call next or reset.
- [ ] Doctor can complete and set doctor status, not call next or reset.
- [ ] Queue manager reset creates exactly 20 demo patients twice in a row and leaves a non-demo patient untouched.
- [ ] Call next while a token is already called returns a clear error.
- [ ] Two staff browsers see queue changes without a manual refresh.
- [ ] Board updates without refresh and never shows a patient name.

## Planned cloud architecture

- Supabase PostgreSQL holds the shared queue, with Realtime for staff and a sanitized board RPC for the waiting room.
- The Vite app is planned for Vercel. `vercel.json` rewrites deep links to `index.html`.
- Sarvam voice, when added, will use a server-side proxy. That is not part of this phase.

## Current limitations

- QR scanning, indoor navigation, patient urgent-help UI, Sarvam, phone calls, and forecasting are not implemented.
- `/staff/forecast` remains marked not implemented.
- Hosted end-to-end registration is only verified after the vault migration and Edge Functions are deployed.
- English and Hindi cover the UI strings used in Phases 1–4.

## Safety

This is a hackathon demonstration. Do not enter real medical information or real phone numbers. The database has no phone-number column. For a real emergency, go to Emergency and contact local emergency services. The demo shows 112 and 108.
