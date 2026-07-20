-- Forward-only additive migration: AI enrichment timeline event types.
-- Explicitly approved for Labs only (csaefdkpwukshtouyixg).
-- Never run against production (jkrfyvukhhsapoivntms).

-- Extends listing_activity_events check constraint so enrichment runs can
-- append immutable plain-language timeline entries.

alter table public.listing_activity_events
    drop constraint if exists listing_activity_events_event_type_check;

alter table public.listing_activity_events
    add constraint listing_activity_events_event_type_check
    check (
        event_type in (
            'first_seen',
            'source_listed',
            'price_changed',
            'currency_changed',
            'benchmark_recalculated',
            'source_marked_sold',
            'source_marked_rented',
            'source_marked_under_contract',
            'source_returned_active',
            'missing_from_source',
            'removed_from_source',
            'relisted',
            'source_attribution_changed',
            'material_field_changed',
            'source_description_changed',
            -- AI enrichment audit events (auto-apply / exception review)
            'ai_enrichment_started',
            'ai_enrichment_completed',
            'ai_enrichment_failed',
            'ai_enrichment_skipped',
            'ai_enrichment_auto_applied',
            'ai_enrichment_needs_attention',
            'manual_override'
        )
    );

comment on constraint listing_activity_events_event_type_check
    on public.listing_activity_events is
    'Includes AI enrichment audit events. Timeline remains append-only/immutable.';
