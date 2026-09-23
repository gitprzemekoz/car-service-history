-- Service entry loop (follow-up to roles and domain schema)
--
-- Makes the schema safe and complete for the first write paths: closes the
-- RLS role gap on domain inserts/updates, hardens client email matching,
-- adds registration number and mileage, enforces one vehicle per client, and
-- adds an atomic client + vehicle RPC.

-- 1. Missing columns and constraints

alter table vehicles
  add column registration_number text not null;

create unique index vehicles_client_id_key on vehicles (client_id);

alter table service_entries
  add column mileage integer not null check (mileage >= 0);

alter table clients
  add constraint clients_email_lowercase check (email = lower(email));

create unique index clients_email_key on clients (email);

-- 2. Signup trigger: match pending clients case-insensitively
--    (clients.email is stored lowercase; auth emails may not be).

create or replace function handle_new_user()
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
    and email = lower(new.email)
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

-- 3. Insert/update policies additionally require the caller to be a mechanic.
--    Select policies are unchanged.
--
--    Users must not change their own role: profiles are written only by
--    handle_new_user() (security definer), so the self-update policy goes.

drop policy "profiles_update_own" on profiles;

drop policy "clients_insert_mechanic" on clients;
drop policy "clients_update_mechanic" on clients;

create policy "clients_insert_mechanic"
  on clients for insert
  with check (
    mechanic_id = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
    )
  );

create policy "clients_update_mechanic"
  on clients for update
  using (
    mechanic_id = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
    )
  );

drop policy "vehicles_insert_mechanic" on vehicles;
drop policy "vehicles_update_mechanic" on vehicles;

create policy "vehicles_insert_mechanic"
  on vehicles for insert
  with check (
    exists (
      select 1 from clients
      where clients.id = vehicles.client_id
        and clients.mechanic_id = auth.uid()
    )
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
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
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
    )
  );

drop policy "service_entries_insert_mechanic" on service_entries;
drop policy "service_entries_update_mechanic" on service_entries;

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
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
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
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'mechanic'
    )
  );

-- 4. Atomic client + vehicle creation.
--    security invoker (not definer) so the policies above still decide access.
--    A duplicate email raises unique_violation (23505) on clients_email_key,
--    and the whole call rolls back (no orphan clients row).

create function create_client_with_vehicle(
  p_name text,
  p_email text,
  p_make text,
  p_model text,
  p_registration_number text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_client_id uuid;
begin
  insert into clients (mechanic_id, name, email)
  values (auth.uid(), p_name, lower(p_email))
  returning id into new_client_id;

  insert into vehicles (client_id, make, model, registration_number)
  values (new_client_id, p_make, p_model, p_registration_number);

  return new_client_id;
end;
$$;

revoke execute on function create_client_with_vehicle(text, text, text, text, text) from public, anon;
grant execute on function create_client_with_vehicle(text, text, text, text, text) to authenticated;
