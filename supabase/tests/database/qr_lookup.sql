-- QR lookup vault checks. Run with: npx supabase test db
-- Local only. Rolls back fixture rows.

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select has_table('private', 'queue_qr_tokens', 'QR hashes live in private schema');

select ok(
  not has_table_privilege('anon', 'private.queue_qr_tokens', 'select'),
  'anon cannot select private.queue_qr_tokens'
);

select ok(
  has_function_privilege('service_role', 'public.lookup_my_turn_by_qr(text)', 'execute'),
  'service_role can execute lookup_my_turn_by_qr'
);

select ok(
  not has_function_privilege('anon', 'public.lookup_my_turn_by_qr(text)', 'execute'),
  'anon cannot execute lookup_my_turn_by_qr'
);

select throws_ok(
  $$select public.lookup_my_turn_by_qr('0000000000000000000000000000000000000000000000000000000000000000')$$,
  '22023',
  'invalid or expired QR code',
  'unknown QR hash returns a generic invalid/expired error'
);

select throws_ok(
  $$select public.lookup_my_turn_by_qr('not-a-hash')$$,
  '22023',
  'invalid or expired QR code',
  'malformed QR hash returns the same generic error'
);

select * from finish();

rollback;
