-- Nombres siempre con la primera letra de cada palabra en mayúscula y el resto en minúscula
-- («juan ARANDA» → «Juan Aranda»); «de», «del», «la», «las», «los», «y», «e» quedan en
-- minúscula salvo al inicio. Quita espacios sobrantes. Las tildes se respetan tal cual.
create or replace function public.nombre_bonito(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p is null then null else coalesce((
    select string_agg(
             case when s.i > 1 and lower(s.w) in ('de','del','la','las','los','y','e')
                  then lower(s.w)
                  else upper(left(s.w, 1)) || lower(substr(s.w, 2)) end,
             ' ' order by s.i)
    from regexp_split_to_table(btrim(regexp_replace(p, '\s+', ' ', 'g')), ' ')
         with ordinality as s(w, i)
    where s.w <> ''
  ), '') end
$$;

create or replace function public.trg_nombre_bonito()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_TABLE_NAME = 'workers' then
    new.name := public.nombre_bonito(new.name);
  else
    new.nombre := public.nombre_bonito(new.nombre);
  end if;
  return new;
end
$$;

drop trigger if exists trg_workers_nombre_bonito on public.workers;
create trigger trg_workers_nombre_bonito
  before insert or update of name on public.workers
  for each row execute function public.trg_nombre_bonito();

drop trigger if exists trg_user_roles_nombre_bonito on public.user_roles;
create trigger trg_user_roles_nombre_bonito
  before insert or update of nombre on public.user_roles
  for each row execute function public.trg_nombre_bonito();
