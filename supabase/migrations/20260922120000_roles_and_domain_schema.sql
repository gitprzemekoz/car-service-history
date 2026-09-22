-- Roles and domain schema foundation
--
-- Introduces the mechanic/client role distinction, the minimal domain schema
-- (clients, vehicles, service_entries), and RLS enforcing the PRD's privacy
-- guardrail: a client's vehicle data and service history are visible only to
-- that client and their assigned mechanic.

-- 1. Role enum + profiles table (1:1 with auth.users)

create type role as enum ('mechanic', 'client');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role role not null,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_own"
  on profiles for select
  using (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  using (id = auth.uid());

-- 2. Domain tables

create table clients (
  id uuid primary key default gen_random_uuid(),
  mechanic_id uuid not null references profiles(id),
  user_id uuid references auth.users(id),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;

create policy "clients_select_mechanic"
  on clients for select
  using (mechanic_id = auth.uid());

create policy "clients_insert_mechanic"
  on clients for insert
  with check (mechanic_id = auth.uid());

create policy "clients_update_mechanic"
  on clients for update
  using (mechanic_id = auth.uid());

create policy "clients_select_own"
  on clients for select
  using (user_id = auth.uid());

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  make text not null,
  model text not null,
  created_at timestamptz not null default now()
);

alter table vehicles enable row level security;

create policy "vehicles_select_mechanic"
  on vehicles for select
  using (
    exists (
      select 1 from clients
      where clients.id = vehicles.client_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "vehicles_insert_mechanic"
  on vehicles for insert
  with check (
    exists (
      select 1 from clients
      where clients.id = vehicles.client_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "vehicles_update_mechanic"
  on vehicles for update
  using (
    exists (
      select 1 from clients
      where clients.id = vehicles.client_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "vehicles_select_client"
  on vehicles for select
  using (
    exists (
      select 1 from clients
      where clients.id = vehicles.client_id
        and clients.user_id = auth.uid()
    )
  );

create table service_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  mechanic_id uuid not null references profiles(id),
  service_type text not null,
  service_date date not null,
  cost numeric,
  notes text,
  next_due_mileage integer,
  next_due_date date,
  created_at timestamptz not null default now()
);

alter table service_entries enable row level security;

create policy "service_entries_select_mechanic"
  on service_entries for select
  using (
    exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = service_entries.vehicle_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "service_entries_insert_mechanic"
  on service_entries for insert
  with check (
    mechanic_id = auth.uid()
    and exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = service_entries.vehicle_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "service_entries_update_mechanic"
  on service_entries for update
  using (
    mechanic_id = auth.uid()
    and exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = service_entries.vehicle_id
        and clients.mechanic_id = auth.uid()
    )
  );

create policy "service_entries_select_client"
  on service_entries for select
  using (
    exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = service_entries.vehicle_id
        and clients.user_id = auth.uid()
    )
  );

-- 3. Signup trigger: create the profile row, and link a pending client row
--    by email if a mechanic already added this person as a client.

create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_client_id uuid;
begin
  select id into matched_client_id
  from clients
  where user_id is null
    and email = new.email
  limit 1;

  if matched_client_id is not null then
    update clients
    set user_id = new.id
    where id = matched_client_id;

    insert into profiles (id, role)
    values (new.id, 'client');
  else
    insert into profiles (id, role)
    values (new.id, 'mechanic');
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();
