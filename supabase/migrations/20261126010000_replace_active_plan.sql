-- Replace the signed-in user's active plan in one transaction: archive the old plan,
-- create the new one and its sessions. If any step fails, nothing changes.
-- SECURITY INVOKER: runs with the caller's permissions, so row-level security still applies.
create or replace function public.stride_replace_active_plan(p_goal jsonb, p_warnings text[], p_sessions jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_goal) is distinct from 'object' then
    raise exception 'Goal must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sessions) is distinct from 'array' or jsonb_array_length(p_sessions) > 1000 then
    raise exception 'Sessions must be an array of at most 1000 items' using errcode = '22023';
  end if;

  update public.plans set status = 'archived' where user_id = uid and status = 'active';

  insert into public.plans (user_id, source, goal, warnings)
  values (uid, 'rules', p_goal, coalesce(p_warnings, '{}'))
  returning id into new_id;

  insert into public.plan_sessions (plan_id, user_id, local_date, kind, label, distance_km, minutes, note)
  select new_id, uid,
         (s ->> 'local_date')::date,
         s ->> 'kind',
         s ->> 'label',
         nullif(s ->> 'distance_km', '')::numeric,
         nullif(s ->> 'minutes', '')::integer,
         s ->> 'note'
  from jsonb_array_elements(p_sessions) as s;

  return new_id;
end;
$$;

revoke execute on function public.stride_replace_active_plan(jsonb, text[], jsonb) from public, anon;
grant execute on function public.stride_replace_active_plan(jsonb, text[], jsonb) to authenticated;
