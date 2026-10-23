-- Phase 3 queue, role, board, and reset checks. Run with: npx supabase test db
-- Requires Docker and a local Supabase stack. Not a hosted verification.

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

select ok(
  not has_function_privilege('anon', 'public.call_next(uuid)', 'execute'),
  'anon cannot execute call_next'
);

select ok(
  not has_function_privilege('anon', 'public.reset_demo()', 'execute'),
  'anon cannot execute reset_demo'
);

select ok(
  has_function_privilege('anon', 'public.get_board_snapshot()', 'execute'),
  'anon can execute get_board_snapshot'
);

select ok(
  has_function_privilege('authenticated', 'public.call_next(uuid)', 'execute'),
  'authenticated can execute call_next; role checks happen inside'
);

select ok(
  not has_function_privilege('anon', 'private.call_next(uuid)', 'execute'),
  'anon cannot execute private.call_next'
);

select ok(
  not has_function_privilege('authenticated', 'private.call_next(uuid)', 'execute'),
  'authenticated cannot execute private.call_next directly'
);

select is_empty(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'patients'
      and column_name in ('phone', 'mobile', 'phone_number')
  $$,
  'patients still has no phone column'
);

insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-000000000001', 'registrar@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'manager@example.test'),
  ('10000000-0000-4000-8000-000000000003', 'doctor@example.test'),
  ('10000000-0000-4000-8000-000000000004', 'visitor@example.test');

insert into public.staff_members (user_id, display_name, role, active)
values
  ('10000000-0000-4000-8000-000000000001', 'Demo Registrar', 'registrar', true),
  ('10000000-0000-4000-8000-000000000002', 'Demo Manager', 'queue_manager', true),
  ('10000000-0000-4000-8000-000000000003', 'Demo Doctor', 'doctor', true);

-- Non-staff authenticated user
reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000004',
    true
  );
end;
$$;
set local role authenticated;

select throws_ok(
  $$select public.reset_demo()$$,
  '42501',
  'active staff membership required',
  'authenticated non-staff cannot reset the demo'
);

select throws_ok(
  $$select public.call_next('00000000-0000-4000-8000-000000000099'::uuid)$$,
  '42501',
  'active staff membership required',
  'authenticated non-staff cannot call next'
);

-- Registrar cannot mutate the queue
reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000001',
    true
  );
end;
$$;
set local role authenticated;

select throws_ok(
  $$select public.reset_demo()$$,
  '42501',
  'role registrar is not allowed for this operation',
  'registrar cannot reset the demo'
);

select throws_ok(
  $$select public.call_next((select id from public.departments where code = 'general_medicine'))$$,
  '42501',
  'role registrar is not allowed for this operation',
  'registrar cannot call next'
);

-- Queue manager seeds and operates the queue
reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000002',
    true
  );
end;
$$;
set local role authenticated;

select is(
  (public.reset_demo() ->> 'patients')::integer,
  20,
  'first reset creates exactly 20 demo patients'
);

select is(
  (select count(*)::integer from public.patients where is_demo),
  20,
  'demo patient count is 20 after reset'
);

select is(
  (select count(*)::integer from public.queue_entries where is_demo),
  20,
  'demo queue entry count is 20 after reset'
);

select is(
  (
    select count(*)::integer
    from (
      select department_id
      from public.queue_entries
      where is_demo and status = 'called'
      group by department_id
      having count(*) > 1
    ) as doubled
  ),
  0,
  'reset never leaves more than one called token per department'
);

select is(
  (public.reset_demo() ->> 'patients')::integer,
  20,
  'second reset still reports exactly 20 patients'
);

select is(
  (select count(*)::integer from public.patients where is_demo),
  20,
  'repeated reset does not accumulate demo patients'
);

reset role;

select lives_ok(
  $$
    insert into public.patients (display_name, age, is_demo)
    values ('Keep Me Non Demo', 40, false)
  $$,
  'setup inserts a non-demo patient as the table owner after reset'
);

reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000002',
    true
  );
end;
$$;
set local role authenticated;

select is(
  (public.reset_demo() ->> 'patients')::integer,
  20,
  'reset after a non-demo insert still creates 20 demo patients'
);

reset role;
select is(
  (select count(*)::integer from public.patients where display_name = 'Keep Me Non Demo'),
  1,
  'reset preserves non-demo patients'
);

reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000002',
    true
  );
end;
$$;
set local role authenticated;

select throws_ok(
  $$select public.call_next((select id from public.departments where code = 'general_medicine'))$$,
  'P0001',
  'a token is already called in this department',
  'call next refuses when a called token already exists'
);

-- Complete the called GM token, then call next twice without overlap
select lives_ok(
  $$
    select public.complete_token(
      (
        select id
        from public.queue_entries
        where department_id = (select id from public.departments where code = 'general_medicine')
          and status = 'called'
        limit 1
      )
    )
  $$,
  'queue manager can complete a called token'
);

select results_eq(
  $$
    select token_code
    from public.call_next((select id from public.departments where code = 'general_medicine'))
  $$,
  array['GM-003'],
  'call next selects the earliest waiting token'
);

select throws_ok(
  $$select public.call_next((select id from public.departments where code = 'general_medicine'))$$,
  'P0001',
  'a token is already called in this department',
  'a second call next in the same department fails while one token is called'
);

-- Doctor may complete, but not call next
reset role;
do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000003',
    true
  );
end;
$$;
set local role authenticated;

select lives_ok(
  $$
    select public.complete_token(
      (
        select id
        from public.queue_entries
        where department_id = (select id from public.departments where code = 'general_medicine')
          and status = 'called'
        limit 1
      )
    )
  $$,
  'doctor can complete a called token'
);

select throws_ok(
  $$select public.call_next((select id from public.departments where code = 'general_medicine'))$$,
  '42501',
  'role doctor is not allowed for this operation',
  'doctor cannot call next'
);

select lives_ok(
  $$
    select public.set_doctor_status(
      (select id from public.departments where code = 'general_medicine'),
      'running_late',
      10,
      null
    )
  $$,
  'doctor can update doctor status'
);

-- Anonymous board snapshot is sanitized
reset role;
do $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;
set local role anon;

select ok(
  (
    select bool_and(
      called_token is null
      or called_token ~ '^[A-Z0-9]+-[0-9]{3}$'
    )
    from public.get_board_snapshot()
  ),
  'board called tokens are token codes only'
);

select ok(
  (
    select bool_and(
      to_jsonb(snapshot) ? 'department_code'
      and to_jsonb(snapshot) ? 'called_token'
      and to_jsonb(snapshot) ? 'next_waiting_tokens'
      and not (to_jsonb(snapshot) ? 'patient_id')
      and not (to_jsonb(snapshot) ? 'display_name')
      and not (to_jsonb(snapshot) ? 'age')
      and not (to_jsonb(snapshot) ? 'gender')
      and not (to_jsonb(snapshot) ? 'user_id')
    )
    from public.get_board_snapshot() as snapshot
  ),
  'board snapshot row shape has no private identity fields'
);

select throws_ok(
  'select id from public.patients',
  '42501',
  'permission denied for table patients',
  'anon still cannot read patients while the board function is available'
);

select is(
  (select count(*)::integer from public.get_board_snapshot()),
  7,
  'board snapshot returns one row per active department'
);

select * from finish();

rollback;
