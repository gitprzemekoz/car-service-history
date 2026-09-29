-- Service entry edits
--
-- Makes mechanic edits safe at the database level: every real change keeps
-- the previous version in service_entry_revisions, and the entry records when
-- it was last edited (updated_at).

-- 1. Last-edited timestamp. Null means never edited; existing rows stay null.

alter table service_entries
  add column updated_at timestamptz;

-- 2. Revision history: one row per real edit, holding the old editable values.
--    RLS on with no policies, so the table is unreachable through the API;
--    only the security definer trigger below writes to it.

create table service_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  service_entry_id uuid not null references service_entries(id) on delete cascade,
  service_type text not null,
  service_date date not null,
  mileage integer not null,
  cost numeric,
  notes text,
  next_due_mileage integer,
  next_due_date date,
  updated_at timestamptz,
  revised_at timestamptz not null default now(),
  revised_by uuid references auth.users(id)
);

alter table service_entry_revisions enable row level security;

-- 3. Before-update trigger.
--    - vehicle_id, mechanic_id and created_at are immutable: changing them raises.
--    - If no editable column changed, the row passes through untouched
--      (no revision, no updated_at bump), so re-saving an untouched form does
--      not mark the entry as edited.
--    - Otherwise the old editable values are stored as a revision and
--      updated_at is set to now().

create function service_entry_before_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.vehicle_id is distinct from old.vehicle_id
    or new.mechanic_id is distinct from old.mechanic_id
    or new.created_at is distinct from old.created_at then
    raise exception 'service_entries.vehicle_id, mechanic_id and created_at cannot be changed';
  end if;

  if new.service_type is not distinct from old.service_type
    and new.service_date is not distinct from old.service_date
    and new.mileage is not distinct from old.mileage
    and new.cost is not distinct from old.cost
    and new.notes is not distinct from old.notes
    and new.next_due_mileage is not distinct from old.next_due_mileage
    and new.next_due_date is not distinct from old.next_due_date then
    return new;
  end if;

  insert into service_entry_revisions (
    service_entry_id,
    service_type,
    service_date,
    mileage,
    cost,
    notes,
    next_due_mileage,
    next_due_date,
    updated_at,
    revised_by
  )
  values (
    old.id,
    old.service_type,
    old.service_date,
    old.mileage,
    old.cost,
    old.notes,
    old.next_due_mileage,
    old.next_due_date,
    old.updated_at,
    auth.uid()
  );

  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function service_entry_before_update() from public, anon, authenticated;

create trigger service_entry_before_update
  before update on service_entries
  for each row
  execute function service_entry_before_update();
