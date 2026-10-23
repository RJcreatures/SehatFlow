-- Phase 4 follow-up: move access-code hashes out of readable queue rows,
-- and add a service-role-only My Turn lookup. Does not reset demo data.

create table private.queue_access_codes (
  queue_entry_id uuid primary key
    references public.queue_entries (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  constraint queue_access_codes_hash_check check (code_hash ~ '^[0-9a-f]{64}$')
);

comment on table private.queue_access_codes is
  'SHA-256 hex hashes of patient access codes. Not exposed on the Data API.';

revoke all on table private.queue_access_codes from public, anon, authenticated;
grant all on table private.queue_access_codes to service_role;

-- Move any hashes created by the earlier Phase 4 migration, then drop the column.
insert into private.queue_access_codes (queue_entry_id, code_hash, created_at)
select id, access_code_hash, created_at
from public.queue_entries
where access_code_hash is not null
on conflict (queue_entry_id) do nothing;

alter table public.queue_entries
  drop constraint if exists queue_entries_access_code_hash_check;

alter table public.queue_entries
  drop column if exists access_code_hash;

-- Replace registration so hashes land only in the private vault.
create or replace function public.register_demo_patient(
  p_display_name text,
  p_age integer,
  p_gender text,
  p_department_code text,
  p_access_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.simulated_now();
  v_today date;
  v_department public.departments%rowtype;
  v_patient_id uuid;
  v_entry_id uuid;
  v_token_number integer;
  v_token_code text;
  v_wait integer;
begin
  if p_display_name is null
     or char_length(btrim(p_display_name)) < 1
     or char_length(btrim(p_display_name)) > 80
     or p_age is null
     or p_age < 0
     or p_age > 120
     or (
       p_gender is not null
       and p_gender not in ('female', 'male', 'other', 'undisclosed')
     )
     or p_department_code is null
     or p_department_code !~ '^[a-z0-9_]{2,32}$'
     or p_access_code_hash is null
     or p_access_code_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid registration input'
      using errcode = '22023';
  end if;

  select *
  into v_department
  from public.departments
  where code = p_department_code
    and active = true;

  if not found then
    raise exception 'unknown or inactive department'
      using errcode = '22023';
  end if;

  v_today := private.service_date();
  perform private.lock_department(v_department.id);
  perform private.ensure_doctor_status(v_department.id);

  v_token_number := private.next_token_number(v_department.id, v_today);
  if v_token_number > 9999 then
    raise exception 'department queue is full'
      using errcode = '22003';
  end if;

  v_token_code := private.format_token(
    private.token_prefix(v_department.code),
    v_token_number
  );

  insert into public.patients (
    display_name,
    age,
    gender,
    is_demo,
    created_at
  )
  values (
    btrim(p_display_name),
    p_age,
    p_gender,
    true,
    v_now
  )
  returning id into v_patient_id;

  insert into public.queue_entries (
    patient_id,
    department_id,
    token_number,
    token_code,
    service_date,
    status,
    queued_at,
    created_at,
    updated_at,
    is_demo
  )
  values (
    v_patient_id,
    v_department.id,
    v_token_number,
    v_token_code,
    v_today,
    'waiting',
    v_now,
    v_now,
    v_now,
    true
  )
  returning id into v_entry_id;

  insert into private.queue_access_codes (
    queue_entry_id,
    code_hash,
    created_at
  )
  values (
    v_entry_id,
    p_access_code_hash,
    v_now
  );

  perform private.write_queue_event(
    v_entry_id,
    'enqueued',
    null,
    'waiting',
    null,
    jsonb_build_object(
      'token_code', v_token_code,
      'demo', true
    )
  );

  v_wait := private.estimate_wait_for_entry(
    v_department.id,
    v_today,
    v_token_number,
    'waiting',
    v_now
  );

  return jsonb_build_object(
    'token_code', v_token_code,
    'department_code', v_department.code,
    'department_name_en', v_department.name_en,
    'department_name_hi', v_department.name_hi,
    'room_en', v_department.room_en,
    'room_hi', v_department.room_hi,
    'floor_en', v_department.floor_en,
    'floor_hi', v_department.floor_hi,
    'estimated_wait_minutes', v_wait,
    'service_date', v_today
  );
end;
$$;

revoke all on function public.register_demo_patient(text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_demo_patient(text, integer, text, text, text)
  to service_role;

-- Lookup returns queue facts only. Same error for missing token or bad code.
create or replace function public.lookup_my_turn(
  p_token_code text,
  p_access_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := private.simulated_now();
  v_entry public.queue_entries%rowtype;
  v_department public.departments%rowtype;
  v_stored_hash text;
  v_ahead integer;
  v_wait integer;
begin
  if p_token_code is null
     or p_token_code !~ '^[A-Z0-9]{1,8}-[0-9]{1,4}$'
     or p_access_code_hash is null
     or p_access_code_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'invalid token or access code'
      using errcode = '22023';
  end if;

  select q.*
  into v_entry
  from public.queue_entries as q
  where q.token_code = p_token_code
  order by q.service_date desc, q.created_at desc
  limit 1;

  if not found then
    raise exception 'invalid token or access code'
      using errcode = '22023';
  end if;

  select code_hash
  into v_stored_hash
  from private.queue_access_codes
  where queue_entry_id = v_entry.id;

  if v_stored_hash is null or v_stored_hash is distinct from p_access_code_hash then
    raise exception 'invalid token or access code'
      using errcode = '22023';
  end if;

  select *
  into v_department
  from public.departments
  where id = v_entry.department_id;

  v_ahead := private.people_ahead(
    v_entry.department_id,
    v_entry.service_date,
    v_entry.token_number,
    v_entry.status
  );

  v_wait := case
    when v_entry.status in ('waiting', 'called') then
      private.estimate_wait_for_entry(
        v_entry.department_id,
        v_entry.service_date,
        v_entry.token_number,
        v_entry.status,
        v_now
      )
    else null
  end;

  return jsonb_build_object(
    'token_code', v_entry.token_code,
    'department_code', v_department.code,
    'department_name_en', v_department.name_en,
    'department_name_hi', v_department.name_hi,
    'room_en', v_department.room_en,
    'room_hi', v_department.room_hi,
    'floor_en', v_department.floor_en,
    'floor_hi', v_department.floor_hi,
    'status', v_entry.status,
    'patients_ahead', v_ahead,
    'estimated_wait_minutes', v_wait,
    'service_date', v_entry.service_date
  );
end;
$$;

revoke all on function public.lookup_my_turn(text, text)
  from public, anon, authenticated;
grant execute on function public.lookup_my_turn(text, text)
  to service_role;

-- Reset must also clear private access codes for demo entries (cascade does this
-- when queue entries are deleted). Ensure demo event cleanup still works.
