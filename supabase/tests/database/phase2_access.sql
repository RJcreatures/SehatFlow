-- Local security checks for Phase 2. Run with: npx supabase test db
-- Requires the local Supabase stack. This file does not contact a hosted project.

begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select is_empty(
  $$
    select c.relname
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'departments',
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
      and c.relrowsecurity is not true
  $$,
  'RLS is enabled on every application table'
);

select is_empty(
  $$
    select c.relname, pol.polname
    from pg_policy as pol
    join pg_class as c on c.oid = pol.polrelid
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'departments',
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
      and pol.polcmd in ('*', 'a', 'w', 'd')
  $$,
  'application tables have no insert, update, delete, or all-command policies'
);

select is_empty(
  $$
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name in (
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
  $$,
  'anon has no privileges on staff, patient, queue, doctor, urgent, or audit tables'
);

select results_eq(
  $$
    select privilege_type::text
    from information_schema.role_table_grants
    where grantee = 'anon'
      and table_schema = 'public'
      and table_name = 'departments'
    order by privilege_type
  $$,
  array['SELECT'],
  'anon can only select departments'
);

select is_empty(
  $$
    select table_name, privilege_type
    from information_schema.role_table_grants
    where grantee = 'PUBLIC'
      and table_schema = 'public'
      and table_name in (
        'departments',
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
  $$,
  'PUBLIC has no privileges on application tables'
);

select is_empty(
  $$
    select grantee, table_name, privilege_type
    from information_schema.role_table_grants
    where grantee in ('anon', 'authenticated', 'PUBLIC')
      and table_schema = 'public'
      and table_name in (
        'departments',
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  $$,
  'browser roles cannot write application tables'
);

select results_eq(
  $$
    select distinct table_name::text
    from information_schema.role_table_grants
    where grantee = 'authenticated'
      and table_schema = 'public'
      and privilege_type = 'SELECT'
      and table_name in (
        'departments',
        'staff_members',
        'patients',
        'queue_entries',
        'doctor_status',
        'urgent_flags',
        'queue_events'
      )
    order by table_name
  $$,
  array[
    'departments',
    'doctor_status',
    'patients',
    'queue_entries',
    'queue_events',
    'staff_members',
    'urgent_flags'
  ],
  'authenticated can select every application table, with RLS still applied'
);

select ok(
  not has_function_privilege('anon', 'private.is_active_staff()', 'execute'),
  'anon cannot execute private.is_active_staff'
);

select ok(
  not exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) as acl
    where n.nspname = 'private'
      and p.proname = 'is_active_staff'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute private.is_active_staff'
);

select ok(
  has_function_privilege('authenticated', 'private.is_active_staff()', 'execute'),
  'authenticated can execute private.is_active_staff for row policies'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anon has no usage on schema private'
);

select ok(
  not exists (
    select 1
    from pg_namespace as n
    cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) as acl
    where n.nspname = 'private'
      and acl.grantee = 0
      and acl.privilege_type = 'USAGE'
  ),
  'PUBLIC has no usage on schema private'
);

select ok(
  has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated has usage on schema private so policies can call the helper'
);

select ok(
  exists (
    select 1
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.proname = 'is_active_staff'
      and p.prosecdef
      and (
        p.proconfig @> array['search_path=""']
        or p.proconfig @> array['search_path=']
      )
  ),
  'is_active_staff is security definer with an empty search_path'
);

select hasnt_function(
  'public',
  'is_active_staff',
  'the staff helper is not created in the exposed public schema'
);

select results_eq(
  $$
    select tablename::text
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('queue_entries', 'doctor_status', 'urgent_flags')
    order by tablename
  $$,
  array['doctor_status', 'queue_entries', 'urgent_flags'],
  'queue, doctor status, and urgent flags are in the Realtime publication'
);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000000001', 'nonstaff@example.test'),
  ('00000000-0000-4000-8000-000000000002', 'staff@example.test');

insert into public.staff_members (user_id, display_name, role, active)
values (
  '00000000-0000-4000-8000-000000000002',
  'Demo Registrar',
  'registrar',
  true
);

insert into public.patients (id, display_name, age)
values (
  '00000000-0000-4000-8000-000000000010',
  'Demo Patient',
  34
);

insert into public.departments (
  code,
  name_en,
  name_hi,
  room_en,
  room_hi,
  floor_en,
  floor_hi,
  estimated_minutes,
  display_order,
  active
)
values (
  'closed_demo',
  'Closed demo clinic',
  'बंद डेमो',
  'Room 99',
  'कक्ष 99',
  'Ground floor',
  'भूतल',
  10,
  99,
  false
);

do $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

set local role anon;

select results_eq(
  $$select code from public.departments order by display_order$$,
  array[
    'general_medicine',
    'pediatrics',
    'womens_health',
    'orthopedics',
    'ent',
    'ophthalmology',
    'dermatology'
  ],
  'anon reads the seven active fictional departments'
);

select is_empty(
  $$select code from public.departments where code = 'closed_demo'$$,
  'anon cannot read an inactive department'
);

select throws_ok(
  'select user_id from public.staff_members',
  '42501',
  'permission denied for table staff_members',
  'anon cannot read staff membership'
);

select throws_ok(
  'select id from public.patients',
  '42501',
  'permission denied for table patients',
  'anon cannot read patients'
);

select throws_ok(
  'select id from public.queue_entries',
  '42501',
  'permission denied for table queue_entries',
  'anon cannot read queue entries'
);

select throws_ok(
  'select department_id from public.doctor_status',
  '42501',
  'permission denied for table doctor_status',
  'anon cannot read doctor status'
);

select throws_ok(
  'select id from public.urgent_flags',
  '42501',
  'permission denied for table urgent_flags',
  'anon cannot read urgent flags'
);

select throws_ok(
  'select id from public.queue_events',
  '42501',
  'permission denied for table queue_events',
  'anon cannot read queue events'
);

reset role;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000001',
    true
  );
end;
$$;

set local role authenticated;

select is_empty(
  $$select id from public.patients$$,
  'an authenticated non-staff user cannot read patients'
);

select throws_ok(
  $$insert into public.patients (display_name, age) values ('Another Demo', 40)$$,
  '42501',
  'permission denied for table patients',
  'an authenticated non-staff user cannot insert patients'
);

select is(
  private.is_active_staff(),
  false,
  'the helper is false for a user who is not active staff'
);

select results_eq(
  $$select count(*)::integer from public.departments$$,
  array[7],
  'an authenticated non-staff user sees only active departments'
);

reset role;

do $$
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config(
    'request.jwt.claim.sub',
    '00000000-0000-4000-8000-000000000002',
    true
  );
end;
$$;

set local role authenticated;

select results_eq(
  $$select count(*)::integer from public.patients$$,
  array[1],
  'active staff can read patient rows'
);

select results_eq(
  $$select count(*)::integer from public.departments where code = 'closed_demo'$$,
  array[1],
  'active staff can read an inactive department'
);

select throws_ok(
  $$update public.staff_members set role = 'admin'$$,
  '42501',
  'permission denied for table staff_members',
  'active staff cannot change membership through the table'
);

select throws_ok(
  $$insert into public.patients (display_name, age) values ('Staff Insert', 20)$$,
  '42501',
  'permission denied for table patients',
  'active staff cannot insert patients directly'
);

select is(
  private.is_active_staff(),
  true,
  'the helper is true for an active staff member'
);

reset role;

select throws_ok(
  $$update public.staff_members set role = 'admin'$$,
  '42501',
  'staff membership cannot be changed from a signed-in session',
  'a signed-in database owner still cannot change staff membership'
);

select * from finish();

rollback;
