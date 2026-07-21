-- Phase 4/5: source-official alternate currencies + presentation classification.
-- Labs only (csaefdkpwukshtouyixg). Forward-only, additive.
-- Does not delete immutable evidence or activity events.

-- ---------------------------------------------------------------------------
-- conversion_method: allow source_official_conversion for public XCG preference
-- ---------------------------------------------------------------------------
alter table public.property_listings
    drop constraint if exists property_listings_conversion_method_check;

alter table public.property_listings
    add constraint property_listings_conversion_method_check
    check (
        conversion_method is null
        or conversion_method in (
            'identity',
            'legacy_1_to_1',
            'usd_fixed_peg',
            'eur_api',
            'source_official_conversion'
        )
    );

alter table public.price_observations
    drop constraint if exists price_observations_conversion_method_check;

alter table public.price_observations
    add constraint price_observations_conversion_method_check
    check (
        conversion_method is null
        or conversion_method in (
            'identity',
            'legacy_1_to_1',
            'usd_fixed_peg',
            'eur_api',
            'source_official_conversion'
        )
    );

-- ---------------------------------------------------------------------------
-- Official alternate currency amounts (never inferred from Merkado FX)
-- Shape: [{amount, currency, provenance, evidence, source_label}, ...]
-- provenance must be 'source_official_conversion' for public XCG preference.
-- ---------------------------------------------------------------------------
alter table public.property_listings
    add column if not exists official_alternate_prices jsonb not null default '[]'::jsonb;

alter table public.price_observations
    add column if not exists official_alternate_prices jsonb not null default '[]'::jsonb;

alter table public.property_listings
    drop constraint if exists property_listings_official_alternate_prices_array_check;
alter table public.property_listings
    add constraint property_listings_official_alternate_prices_array_check
    check (jsonb_typeof(official_alternate_prices) = 'array');

alter table public.price_observations
    drop constraint if exists price_observations_official_alternate_prices_array_check;
alter table public.price_observations
    add constraint price_observations_official_alternate_prices_array_check
    check (jsonb_typeof(official_alternate_prices) = 'array');

comment on column public.property_listings.official_alternate_prices is
    'Source-published alternate currency amounts with provenance source_official_conversion; never Merkado-inferred.';
comment on column public.price_observations.official_alternate_prices is
    'Append-only observation of source-published alternate currency amounts.';

-- ---------------------------------------------------------------------------
-- Presentation classification on activity events (additive; no deletes)
-- Core event facts remain immutable; presentation_* may be updated.
-- ---------------------------------------------------------------------------
alter table public.listing_activity_events
    add column if not exists presentation_class text
        check (
            presentation_class is null
            or presentation_class in (
                'primary',
                'secondary',
                'suppressed',
                'grouped'
            )
        ),
    add column if not exists suppressed_reason text,
    add column if not exists presentation_metadata jsonb not null default '{}'::jsonb;

alter table public.listing_activity_events
    drop constraint if exists listing_activity_events_presentation_metadata_object_check;
alter table public.listing_activity_events
    add constraint listing_activity_events_presentation_metadata_object_check
    check (jsonb_typeof(presentation_metadata) = 'object');

comment on column public.listing_activity_events.presentation_class is
    'UI visibility class. Null means classify at read-time. Never deletes the event.';
comment on column public.listing_activity_events.suppressed_reason is
    'Why an event is hidden/grouped in the default timeline (dual_writer_duplicate, rate_only, etc.).';

-- Replace blanket immutability with presentation-column exception.
drop trigger if exists listing_activity_events_are_immutable
    on public.listing_activity_events;

create or replace function public.prevent_listing_activity_core_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
    if tg_op = 'DELETE' then
        raise exception 'listing_activity_events rows are immutable; do not delete';
    end if;

    if tg_op = 'UPDATE' then
        if new.id is distinct from old.id
            or new.property_listing_id is distinct from old.property_listing_id
            or new.event_type is distinct from old.event_type
            or new.event_at is distinct from old.event_at
            or new.previous_value is distinct from old.previous_value
            or new.new_value is distinct from old.new_value
            or new.listing_observation_id is distinct from old.listing_observation_id
            or new.source_run_id is distinct from old.source_run_id
            or new.derivation_type is distinct from old.derivation_type
            or new.confidence is distinct from old.confidence
            or new.notes is distinct from old.notes
            or new.created_at is distinct from old.created_at
        then
            raise exception
                'listing_activity_events core columns are immutable; only presentation_* may change';
        end if;
        return new;
    end if;

    return new;
end;
$$;

create trigger listing_activity_events_core_immutable
before update or delete on public.listing_activity_events
for each row execute function public.prevent_listing_activity_core_mutation();

revoke all on function public.prevent_listing_activity_core_mutation()
    from public, anon, authenticated;
