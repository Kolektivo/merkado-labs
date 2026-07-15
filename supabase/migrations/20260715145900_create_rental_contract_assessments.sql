create table public.rental_contracts (
    id uuid primary key default gen_random_uuid(),
    property_asset_id uuid not null references public.property_assets(id),
    neighbourhood_id uuid not null references public.neighbourhoods(id),
    contract_reference text not null unique check (btrim(contract_reference) <> ''),
    monthly_rent_xcg numeric not null check (monthly_rent_xcg > 0),
    floor_area_m2 numeric not null check (floor_area_m2 > 0),
    start_date date not null,
    end_date date,
    status text not null default 'active'
        check (status in ('draft', 'active', 'ended', 'cancelled')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint rental_contracts_date_order_check
        check (end_date is null or end_date >= start_date)
);

create table public.contract_market_assessments (
    id uuid primary key default gen_random_uuid(),
    rental_contract_id uuid not null references public.rental_contracts(id),
    market_signal_id uuid not null references public.market_signals(id),
    contract_rent_per_m2 numeric not null check (contract_rent_per_m2 > 0),
    benchmark_value numeric not null check (benchmark_value > 0),
    benchmark_method text not null
        check (benchmark_method in ('median', 'average')),
    difference_value numeric not null,
    difference_percent numeric not null,
    classification text not null
        check (
            classification in (
                'below_market',
                'near_market',
                'above_market',
                'insufficient_evidence'
            )
        ),
    evidence_quality text not null
        check (evidence_quality in ('insufficient', 'limited', 'usable', 'strong')),
    calculation_version text not null check (btrim(calculation_version) <> ''),
    assessed_at timestamptz not null default now(),
    metadata jsonb not null default '{}'::jsonb,
    constraint contract_market_assessments_identity_key
        unique (rental_contract_id, market_signal_id, calculation_version)
);

create index rental_contracts_property_asset_id_idx
    on public.rental_contracts (property_asset_id);
create index rental_contracts_neighbourhood_id_idx
    on public.rental_contracts (neighbourhood_id);
create index contract_market_assessments_market_signal_id_idx
    on public.contract_market_assessments (market_signal_id);

create trigger rental_contracts_set_updated_at
before update on public.rental_contracts
for each row execute function public.set_updated_at();

alter table public.rental_contracts enable row level security;
alter table public.contract_market_assessments enable row level security;

revoke all on table public.rental_contracts from anon, authenticated;
revoke all on table public.contract_market_assessments from anon, authenticated;

comment on table public.rental_contracts is
    'Private, non-personal pilot contract terms. Never store names, addresses, signatures, or documents.';
comment on table public.contract_market_assessments is
    'Private reproducible comparisons between a rental contract and a versioned market signal.';
