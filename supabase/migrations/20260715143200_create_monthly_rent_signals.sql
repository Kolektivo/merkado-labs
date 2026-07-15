create table public.market_signals (
    id uuid primary key default gen_random_uuid(),
    signal_type text not null,
    neighbourhood_id uuid not null references public.neighbourhoods(id),
    period_start date not null,
    period_end date not null,
    currency text not null check (currency ~ '^[A-Z]{3}$'),
    unit text not null,
    sample_size integer not null check (sample_size > 0),
    average_value numeric not null check (average_value > 0),
    median_value numeric not null check (median_value > 0),
    minimum_value numeric not null check (minimum_value > 0),
    maximum_value numeric not null check (maximum_value > 0),
    calculated_at timestamptz not null default now(),
    calculation_version text not null,
    quality_status text not null
        check (quality_status in ('insufficient', 'limited', 'usable', 'strong')),
    metadata jsonb not null default '{}'::jsonb,
    constraint market_signals_period_check check (period_end >= period_start),
    constraint market_signals_value_order_check check (
        minimum_value <= median_value
        and median_value <= maximum_value
        and average_value between minimum_value and maximum_value
    ),
    constraint market_signals_identity_key unique (
        signal_type,
        neighbourhood_id,
        period_start,
        period_end,
        currency,
        unit,
        calculation_version
    )
);

create table public.signal_evidence (
    id uuid primary key default gen_random_uuid(),
    market_signal_id uuid not null references public.market_signals(id) on delete cascade,
    property_listing_id uuid not null references public.property_listings(id),
    price_observation_id uuid not null references public.price_observations(id),
    observed_price numeric not null check (observed_price > 0),
    floor_area_m2 numeric not null check (floor_area_m2 > 0),
    calculated_value numeric not null check (calculated_value > 0),
    created_at timestamptz not null default now(),
    constraint signal_evidence_signal_listing_key
        unique (market_signal_id, property_listing_id),
    constraint signal_evidence_signal_price_observation_key
        unique (market_signal_id, price_observation_id)
);

create index market_signals_neighbourhood_period_idx
    on public.market_signals (neighbourhood_id, period_start desc, period_end desc);
create index signal_evidence_property_listing_id_idx
    on public.signal_evidence (property_listing_id);
create index signal_evidence_price_observation_id_idx
    on public.signal_evidence (price_observation_id);

alter table public.market_signals enable row level security;
alter table public.signal_evidence enable row level security;

revoke all on table public.market_signals from anon, authenticated;
revoke all on table public.signal_evidence from anon, authenticated;

grant select on table public.market_signals to anon;
grant select on table public.signal_evidence to anon;

create policy "Anonymous users can read market signals"
on public.market_signals for select to anon using (true);

create policy "Anonymous users can read signal evidence"
on public.signal_evidence for select to anon using (true);

comment on table public.market_signals is
    'Versioned, period-specific aggregate market signals derived from normalized listings.';
comment on table public.signal_evidence is
    'Exact listing and price-observation evidence used by each market signal.';
