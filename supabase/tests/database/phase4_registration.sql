-- Phase 4 registration vault and lookup checks. Run with: npx supabase test db

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('private', 'queue_access_codes', 'access codes live in private schema');

select ok(
  not has_table_privilege('anon', 'private.queue_access_codes', 'select'),
  'anon cannot select private.queue_access_codes'
);

select ok(
  not has_table_privilege('authenticated', 'private.queue_access_codes', 'select'),
  'authenticated cannot select private.queue_access_codes'
);

select is_empty(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'queue_entries'
      and column_name = 'access_code_hash'
  $$,
  'queue_entries no longer stores access_code_hash'
);

select ok(
  not has_function_privilege('anon', 'public.register_demo_patient(text, integer, text, text, text)', 'execute'),
  'anon cannot execute register_demo_patient'
);

select ok(
  not has_function_privilege('authenticated', 'public.register_demo_patient(text, integer, text, text, text)', 'execute'),
  'authenticated cannot execute register_demo_patient'
);

select ok(
  not has_function_privilege('anon', 'public.lookup_my_turn(text, text)', 'execute'),
  'anon cannot execute lookup_my_turn'
);

select ok(
  has_function_privilege('service_role', 'public.register_demo_patient(text, integer, text, text, text)', 'execute'),
  'service_role can execute register_demo_patient'
);

select ok(
  has_function_privilege('service_role', 'public.lookup_my_turn(text, text)', 'execute'),
  'service_role can execute lookup_my_turn'
);

set local role service_role;

select lives_ok(
  $$
    select public.register_demo_patient(
      'Demo Patient Edge',
      41,
      'undisclosed',
      'general_medicine',
      repeat('a', 64)
    )
  $$,
  'service_role can register a demo patient'
);

select results_eq(
  $$
    select (public.lookup_my_turn(
      (select token_code from public.queue_entries order by created_at desc limit 1),
      repeat('a', 64)
    ) ->> 'patients_ahead')::integer >= 0
  $$,
  array[true],
  'lookup returns queue facts for a matching hash'
);

select throws_ok(
  $$
    select public.lookup_my_turn(
      (select token_code from public.queue_entries order by created_at desc limit 1),
      repeat('b', 64)
    )
  $$,
  '22023',
  'invalid token or access code',
  'lookup fails the same way for a wrong hash'
);

select * from finish();

rollback;
