-- Point-in-polygon neighbourhood assignment helpers for Labs listings.
-- Preserves source neighbourhood_id; stores geographic matches separately.

create or replace function public.preview_listing_neighbourhood_assignments()
returns table (
    listing_id uuid,
    source_neighbourhood_id uuid,
    inferred_neighbourhood_id uuid,
    assignment_status text,
    assignment_method text,
    assignment_confidence numeric
)
language sql
stable
security definer
set search_path = public, extensions
as $$
    with classified as (
        select
            pl.id as listing_id,
            pl.neighbourhood_id as source_neighbourhood_id,
            public.listing_coordinate_quality(pl.latitude, pl.longitude) as coord_quality,
            pl.location
        from public.property_listings pl
    ),
    matched as (
        select
            c.listing_id,
            c.source_neighbourhood_id,
            c.coord_quality,
            n.id as inferred_neighbourhood_id
        from classified c
        left join lateral (
            select nb.id
            from public.neighbourhoods nb
            where nb.boundary is not null
              and nb.is_gap_zone = false
              and c.location is not null
              and c.coord_quality = 'valid_curacao'
              and extensions.st_covers(nb.boundary, c.location)
            order by nb.normalized_name
            limit 1
        ) n on true
    )
    select
        m.listing_id,
        m.source_neighbourhood_id,
        case
            when m.coord_quality = 'valid_curacao' then m.inferred_neighbourhood_id
            else null
        end as inferred_neighbourhood_id,
        case
            when m.coord_quality = 'missing_coords' then 'missing_coords'
            when m.coord_quality = 'invalid_coords' then 'invalid_coords'
            when m.coord_quality = 'outside_curacao' then 'outside_curacao'
            when m.inferred_neighbourhood_id is null then 'outside_polygons'
            when m.source_neighbourhood_id is null then 'inferred'
            when m.source_neighbourhood_id = m.inferred_neighbourhood_id then 'matched'
            else 'conflict'
        end as assignment_status,
        case
            when m.coord_quality <> 'valid_curacao' then null
            when m.inferred_neighbourhood_id is null
                and m.source_neighbourhood_id is not null then 'source'
            when m.inferred_neighbourhood_id is null then null
            when m.source_neighbourhood_id is null then 'point_in_polygon'
            when m.source_neighbourhood_id = m.inferred_neighbourhood_id
                then 'point_in_polygon_match'
            else 'point_in_polygon_conflict'
        end as assignment_method,
        case
            when m.inferred_neighbourhood_id is not null
                and m.coord_quality = 'valid_curacao' then 1.0::numeric
            else null
        end as assignment_confidence
    from matched m;
$$;

create or replace function public.summarize_listing_neighbourhood_assignments()
returns table (assignment_status text, listing_count bigint)
language sql
stable
security definer
set search_path = public, extensions
as $$
    select assignment_status, count(*)::bigint as listing_count
    from public.preview_listing_neighbourhood_assignments()
    group by assignment_status
    order by assignment_status;
$$;

create or replace function public.apply_listing_neighbourhood_assignments()
returns table (assignment_status text, listing_count bigint)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
    update public.property_listings pl
    set
        inferred_neighbourhood_id = preview.inferred_neighbourhood_id,
        neighbourhood_assignment_status = preview.assignment_status,
        neighbourhood_assignment_method = preview.assignment_method,
        neighbourhood_assignment_confidence = preview.assignment_confidence,
        neighbourhood_assigned_at = now()
    from public.preview_listing_neighbourhood_assignments() preview
    where pl.id = preview.listing_id;

    return query
    select s.assignment_status, s.listing_count
    from public.summarize_listing_neighbourhood_assignments() s;
end;
$$;

revoke all on function public.preview_listing_neighbourhood_assignments()
    from public, anon, authenticated;
revoke all on function public.summarize_listing_neighbourhood_assignments()
    from public, anon, authenticated;
revoke all on function public.apply_listing_neighbourhood_assignments()
    from public, anon, authenticated;

grant execute on function public.preview_listing_neighbourhood_assignments()
    to service_role;
grant execute on function public.summarize_listing_neighbourhood_assignments()
    to service_role;
grant execute on function public.apply_listing_neighbourhood_assignments()
    to service_role;

comment on function public.preview_listing_neighbourhood_assignments() is
    'Dry-run point-in-polygon neighbourhood matches. Never overwrites neighbourhood_id.';
comment on function public.apply_listing_neighbourhood_assignments() is
    'Persists inferred neighbourhood matches and statuses without changing source neighbourhood_id.';
