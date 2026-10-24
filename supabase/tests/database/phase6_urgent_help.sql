begin;
select plan(6);

select has_function(
  'public',
  'request_urgent_help',
  array['text', 'text'],
  'request_urgent_help(text, text) exists'
);

select function_privs_are(
  'public',
  'request_urgent_help',
  array['text', 'text'],
  'anon',
  array['EXECUTE'],
  'anon can execute request_urgent_help'
);

select is(
  (
    select count(*)::integer from public.queue_entries
  ),
  (
    with created as (
      select public.request_urgent_help(
        'testidkey1234567890abcdef',
        null
      ) as payload
    )
    select count(*)::integer from public.queue_entries
  ),
  'request_urgent_help does not mutate the routine queue'
);

select results_eq(
  $$
    select (public.request_urgent_help(
      'testidkey1234567890abcdef',
      null
    ) ->> 'reused')::boolean
  $$,
  $$ values (true) $$,
  'duplicate request key reuses the open flag'
);

select is(
  (
    select count(*)::integer
    from public.urgent_flags
    where request_key = 'testidkey1234567890abcdef'
      and status = 'open'
  ),
  1,
  'only one open flag exists for the request key'
);

select ok(
  exists(
    select 1
    from public.urgent_flags
    where request_key = 'testidkey1234567890abcdef'
      and queue_entry_id is null
      and status = 'open'
  ),
  'help flag is open and not tied as a queue reorder'
);

select * from finish();
rollback;
