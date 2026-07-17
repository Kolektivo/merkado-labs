-- Seed approved MVP direct property sources.
-- Does not delete or disable CaribbeanHouseHunt here; that requires reviewed cleanup.

insert into public.property_sources (
    name,
    base_url,
    source_key,
    display_name,
    enabled,
    adapter_status,
    removal_threshold
)
values
        'Keller Williams Curaçao',
        'https://www.kwcuracao.com',
        'keller_williams_curacao',
        'Keller Williams Curaçao',
        true,
        'recon',
        2
    ),
    (
        'Sotheby''s International Realty Curaçao',
        'https://www.sothebysrealty.com',
        'sothebys_curacao',
        'Sotheby''s International Realty',
        true,
        'recon',
        2
    ),
    (
        'RE/MAX Curaçao',
        'https://www.realestate-curacao.com',
        'remax_curacao',
        'RE/MAX',
        true,
        'manual',
        2
    ),
    (
        'Moret Real Estate',
        'https://www.moretrealestate.com',
        'moret_real_estate',
        'Moret Real Estate',
        true,
        'recon',
        2
    ),
    (
        'Monumentenzorg Curaçao',
        'https://www.monumentenzorg.cw',
        'monumentenzorg_curacao',
        'Monumentenzorg Curaçao',
        true,
        'recon',
        2
    )
on conflict (base_url) do update
set
    source_key = excluded.source_key,
    display_name = excluded.display_name,
    enabled = excluded.enabled,
    adapter_status = excluded.adapter_status,
    removal_threshold = excluded.removal_threshold;

-- Mark legacy CHH source retired in registry metadata only (rows retained until cleanup).
update public.property_sources
set
    source_key = coalesce(source_key, 'caribbeanhousehunt'),
    display_name = coalesce(display_name, name),
    enabled = false,
    adapter_status = 'retired'
where base_url ilike '%caribbeanhousehunt%'
   or name ilike '%caribbeanhousehunt%';
