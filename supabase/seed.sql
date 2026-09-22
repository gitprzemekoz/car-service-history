-- Seed data for local RLS verification.
--
-- Seeds one mechanic and one already-linked client so both roles can be
-- exercised manually in Supabase Studio after `npx supabase db reset`.
--
-- Credentials (local dev only):
--   mechanic@example.test / password123
--   client@example.test   / password123

-- 1. Mechanic signs up first. handle_new_user() finds no pending `clients`
--    row for this email, so it creates a mechanic profile.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'mechanic@example.test',
  crypt('password123', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

-- 2. The mechanic adds a client record before that client has an account.
insert into clients (id, mechanic_id, user_id, name, email)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  null,
  'Seeded Client',
  'client@example.test'
);

-- 3. The client signs up. handle_new_user() finds the pending `clients` row
--    matching this email, links it via `user_id`, and creates a client
--    profile (instead of a mechanic profile).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated',
  'client@example.test',
  crypt('password123', gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
);

-- 4. A vehicle for the seeded client.
insert into vehicles (id, client_id, make, model)
values (
  '44444444-4444-4444-4444-444444444444',
  '22222222-2222-2222-2222-222222222222',
  'Toyota',
  'Corolla'
);

-- 5. A service entry, created by the seeded mechanic.
insert into service_entries (
  vehicle_id, mechanic_id, service_type, service_date, cost, notes
) values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  'Oil change',
  current_date,
  150.00,
  'Seeded service entry for RLS verification.'
);
