-- Shareable vehicle history link
--
-- A client can publish one time-limited, read-only link to their vehicle's
-- service history. The table is visible only to the owning client; anonymous
-- visitors reach the data solely through get_shared_vehicle_history(), which
-- enforces the 24h expiry and returns a redacted payload (no cost, notes,
-- next-due fields, ids or timestamps).

-- 1. share_links table (at most one link per vehicle)

create table share_links (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null unique references vehicles(id) on delete cascade,
  token text not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table share_links enable row level security;

-- 2. Client-only policies. No update policy (links are replaced, not edited)
--    and no mechanic policies.

create policy "share_links_select_client"
  on share_links for select
  using (
    exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = share_links.vehicle_id
        and clients.user_id = auth.uid()
    )
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'client'
    )
  );

create policy "share_links_insert_client"
  on share_links for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = share_links.vehicle_id
        and clients.user_id = auth.uid()
    )
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'client'
    )
  );

create policy "share_links_delete_client"
  on share_links for delete
  using (
    exists (
      select 1 from vehicles
      join clients on clients.id = vehicles.client_id
      where vehicles.id = share_links.vehicle_id
        and clients.user_id = auth.uid()
    )
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'client'
    )
  );

-- 3. Create or replace the caller's share link.
--    security invoker so the policies above still decide access. The delete
--    and insert run in the function's single transaction, so a vehicle never
--    has two links. Token: 32 random bytes, base64url without padding
--    (43 chars; translate() drops '=').

create function create_share_link()
returns table (token text, expires_at timestamptz)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_vehicle_id uuid;
begin
  select vehicles.id into v_vehicle_id
  from vehicles
  join clients on clients.id = vehicles.client_id
  where clients.user_id = auth.uid();

  if v_vehicle_id is null then
    raise exception 'No vehicle found for the current user';
  end if;

  delete from share_links
  where share_links.vehicle_id = v_vehicle_id;

  -- token / expires_at are OUT parameters: columns are table-qualified in
  -- expressions, and the INTO targets assign the OUT row.
  insert into share_links (vehicle_id, token, created_by, expires_at)
  values (
    v_vehicle_id,
    translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_'),
    auth.uid(),
    now() + interval '24 hours'
  )
  returning share_links.token, share_links.expires_at
  into token, expires_at;

  return next;
end;
$$;

revoke execute on function create_share_link() from public, anon;
grant execute on function create_share_link() to authenticated;

-- 4. Revoke the caller's share link. No-op when there is none.

create function revoke_share_link()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from share_links
  where share_links.vehicle_id in (
    select vehicles.id
    from vehicles
    join clients on clients.id = vehicles.client_id
    where clients.user_id = auth.uid()
  );
end;
$$;

revoke execute on function revoke_share_link() from public, anon;
grant execute on function revoke_share_link() to authenticated;

-- 5. Public, redacted read by token.
--    security definer so anonymous callers can read without any table access;
--    the function itself is the boundary: it returns null unless the token
--    exists and has not expired, and exposes only the whitelisted fields.

create function get_shared_vehicle_history(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vehicle_id uuid;
begin
  select share_links.vehicle_id into v_vehicle_id
  from share_links
  where share_links.token = p_token
    and share_links.expires_at > now();

  if v_vehicle_id is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'vehicle', jsonb_build_object(
        'make', vehicles.make,
        'model', vehicles.model,
        'registration_number', vehicles.registration_number
      ),
      'entries', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'service_type', service_entries.service_type,
              'service_date', service_entries.service_date,
              'mileage', service_entries.mileage
            )
            order by service_entries.service_date desc,
              service_entries.created_at desc
          )
          from service_entries
          where service_entries.vehicle_id = vehicles.id
        ),
        '[]'::jsonb
      )
    )
    from vehicles
    where vehicles.id = v_vehicle_id
  );
end;
$$;

revoke execute on function get_shared_vehicle_history(text) from public;
grant execute on function get_shared_vehicle_history(text) to anon, authenticated;
