create table public.neighbourhood_aliases (
    id uuid primary key default gen_random_uuid(),
    source_neighbourhood_id uuid not null references public.neighbourhoods(id),
    canonical_neighbourhood_id uuid not null references public.neighbourhoods(id),
    status text not null default 'pending'
        check (status in ('pending', 'approved', 'rejected')),
    match_method text not null check (btrim(match_method) <> ''),
    confidence numeric not null check (confidence between 0 and 1),
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint neighbourhood_aliases_source_key unique (source_neighbourhood_id),
    constraint neighbourhood_aliases_not_self_check
        check (source_neighbourhood_id <> canonical_neighbourhood_id)
);

create index neighbourhood_aliases_canonical_id_idx
    on public.neighbourhood_aliases (canonical_neighbourhood_id);
create index neighbourhood_aliases_status_idx
    on public.neighbourhood_aliases (status);

create function public.prevent_neighbourhood_alias_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if new.source_neighbourhood_id = new.canonical_neighbourhood_id then
        raise exception 'A neighbourhood alias cannot reference itself';
    end if;

    if exists (
        with recursive alias_chain(source_id, canonical_id) as (
            select alias.source_neighbourhood_id, alias.canonical_neighbourhood_id
            from public.neighbourhood_aliases as alias
            where alias.source_neighbourhood_id = new.canonical_neighbourhood_id
              and alias.source_neighbourhood_id <> new.source_neighbourhood_id

            union

            select alias.source_neighbourhood_id, alias.canonical_neighbourhood_id
            from public.neighbourhood_aliases as alias
            join alias_chain as chain
              on alias.source_neighbourhood_id = chain.canonical_id
            where alias.source_neighbourhood_id <> new.source_neighbourhood_id
        )
        select 1
        from alias_chain
        where canonical_id = new.source_neighbourhood_id
    ) then
        raise exception 'Neighbourhood alias mapping would create a cycle';
    end if;

    return new;
end;
$$;

create trigger neighbourhood_aliases_prevent_cycle
before insert or update of source_neighbourhood_id, canonical_neighbourhood_id
on public.neighbourhood_aliases
for each row execute function public.prevent_neighbourhood_alias_cycle();

create trigger neighbourhood_aliases_set_updated_at
before update on public.neighbourhood_aliases
for each row execute function public.set_updated_at();

alter table public.neighbourhood_aliases enable row level security;

revoke all on table public.neighbourhood_aliases from anon, authenticated;
revoke all on function public.prevent_neighbourhood_alias_cycle()
    from public, anon, authenticated;

grant select on table public.neighbourhood_aliases to anon;

create policy "Anonymous users can read neighbourhood aliases"
on public.neighbourhood_aliases for select to anon using (true);

comment on table public.neighbourhood_aliases is
    'Non-destructive review mappings; only approved rows affect grouped market signals.';
