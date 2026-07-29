--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "public";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: accept_trade_offer("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."accept_trade_offer"("p_offer_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_offer public.trade_offers%rowtype;
begin
  select *
  into v_offer
  from public.trade_offers
  where id = p_offer_id;

  if v_offer.id is null then
    raise exception 'Offer not found';
  end if;

  if v_offer.to_user_id <> auth.uid() then
    raise exception 'Not allowed';
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'Offer is not pending';
  end if;

  update public.trade_offers
  set status = 'accepted'
  where id = p_offer_id;

  update public.trade_listings
  set status = 'reserved'
  where id = v_offer.listing_id;

  update public.trade_offers
  set status = 'cancelled'
  where listing_id = v_offer.listing_id
    and id <> p_offer_id
    and status = 'pending';

  insert into public.trade_events (offer_id, actor_user_id, event_type, body)
  values (p_offer_id, auth.uid(), 'accepted', 'Offer accepted');
end;
$$;


--
-- Name: admin_binder_directory(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."admin_binder_directory"() RETURNS TABLE("binder_id" "uuid", "binder_name" "text", "binder_type" "text", "is_public" boolean, "owner_user_id" "uuid", "owner_email" "text", "owner_collector_name" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    raise exception 'Admin only';
  end if;

  return query
  select
    binders.id,
    binders.name,
    binders.type::text,
    binders.is_public,
    binders.user_id,
    profiles.email,
    profiles.collector_name,
    binders.created_at
  from public.binders
  left join public.profiles
    on profiles.id = binders.user_id
  order by binders.created_at desc;
end;
$$;


--
-- Name: enforce_wanted_card_limit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."enforce_wanted_card_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if (
    select count(*)
    from public.wanted_cards
    where user_id = new.user_id
  ) >= 10 then
    raise exception 'Wanted card limit reached. Remove one wanted card before adding another.';
  end if;

  return new;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if exists (select 1 from public.profiles where id = new.id) then
    update public.profiles
    set email = coalesce(public.profiles.email, new.email)
    where id = new.id;

    return new;
  end if;

  if new.email is not null and exists (select 1 from public.profiles where email = new.email) then
    update public.profiles
    set id = new.id,
        email = new.email
    where email = new.email;

    return new;
  end if;

  insert into public.profiles (id, email)
  values (new.id, new.email);

  return new;
end;
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;


--
-- Name: recalculate_binder_values("uuid"); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."recalculate_binder_values"("target_binder_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  update binders
  set
    ebay_value = coalesce((
      select sum(coalesce(ebay_price, 0))
      from binder_cards
      where binder_id = target_binder_id
      and owned = true
    ), 0),

    tcg_value = coalesce((
      select sum(coalesce(tcg_price, 0))
      from binder_cards
      where binder_id = target_binder_id
      and owned = true
    ), 0),

    cardmarket_value = coalesce((
      select sum(coalesce(cardmarket_price, 0))
      from binder_cards
      where binder_id = target_binder_id
      and owned = true
    ), 0),

    last_value_update = now()
  where id = target_binder_id;
end;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: trigger_recalculate_binder_values(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."trigger_recalculate_binder_values"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  perform recalculate_binder_values(coalesce(new.binder_id, old.binder_id));
  return coalesce(new, old);
end;
$$;


--
-- Name: update_binder_card_prices(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."update_binder_card_prices"() RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update binder_cards bc
  set
    ebay_price = latest.ebay_average,
    tcg_price = latest.tcg_mid,
    cardmarket_price = latest.cardmarket_trend,
    last_price_update = now()
  from (
    select distinct on (card_id, set_id)
      card_id,
      set_id,
      ebay_average,
      tcg_mid,
      cardmarket_trend
    from market_price_snapshots
    order by card_id, set_id, snapshot_at desc
  ) latest
  where bc.card_id = latest.card_id
  and bc.set_id = latest.set_id;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: activity_feed; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."activity_feed" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "card_id" "text",
    "set_id" "text",
    "value_change" numeric,
    "is_positive" boolean,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: activity_reactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."activity_reactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid",
    "user_id" "uuid",
    "reaction" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: binders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."binders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#2563eb'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "source_set_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_public" boolean DEFAULT true,
    "ebay_value" numeric,
    "tcg_value" numeric,
    "cardmarket_value" numeric,
    "last_value_update" timestamp with time zone,
    "sort_order" integer DEFAULT 0,
    "gradient" "text"[],
    "cover_key" "text",
    "edition" "text",
    "default_condition" "text" DEFAULT 'Near Mint'::"text" NOT NULL,
    "card_mode" "text" DEFAULT 'raw'::"text" NOT NULL,
    "default_grade_company" "text",
    "default_grade" "text",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "binders_card_mode_check" CHECK (("card_mode" = ANY (ARRAY['raw'::"text", 'graded'::"text"]))),
    CONSTRAINT "binders_type_check" CHECK (("type" = ANY (ARRAY['official'::"text", 'custom'::"text"])))
);


--
-- Name: COLUMN "binders"."default_condition"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binders"."default_condition" IS 'Default condition used for newly displayed or newly added cards in this binder. Individual binder_cards.condition values can override it.';


--
-- Name: COLUMN "binders"."card_mode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binders"."card_mode" IS 'Whether cards in this binder are displayed/priced as raw cards or graded slabs.';


--
-- Name: COLUMN "binders"."default_grade_company"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binders"."default_grade_company" IS 'Default grading company for graded binders, for example PSA, CGC, or BGS.';


--
-- Name: COLUMN "binders"."default_grade"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binders"."default_grade" IS 'Default grade for graded binders, for example 10, 9.5, or 9.';


--
-- Name: COLUMN "binders"."language"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binders"."language" IS 'Primary card language for official set binders. English uses en; Japanese uses ja.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "collector_name" "text",
    "avatar_url" "text",
    "banner_url" "text",
    "pokemon_type" "text" DEFAULT 'water'::"text",
    "background_key" "text" DEFAULT 'galaxy'::"text",
    "avatar_preset" "text",
    "favorite_card_id" "text",
    "favorite_set_id" "text",
    "chase_card_id" "text",
    "chase_set_id" "text",
    "has_seen_onboarding" boolean DEFAULT false,
    "expo_push_token" "text",
    "role" "text" DEFAULT 'user'::"text",
    "stripe_account_id" "text",
    "profile_banner_cosmetic_id" "text",
    "profile_border_cosmetic_id" "text",
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'moderator'::"text", 'admin'::"text"])))
);


--
-- Name: admin_binder_directory_view; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."admin_binder_directory_view" AS
 SELECT "binders"."id" AS "binder_id",
    "binders"."name" AS "binder_name",
    "binders"."type" AS "binder_type",
    "binders"."is_public",
    "binders"."user_id" AS "owner_user_id",
    "profiles"."email" AS "owner_email",
    "profiles"."collector_name" AS "owner_collector_name",
    "binders"."created_at"
   FROM ("public"."binders"
     LEFT JOIN "public"."profiles" ON (("profiles"."id" = "binders"."user_id")))
  ORDER BY "binders"."created_at" DESC;


--
-- Name: binder_card_showcases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."binder_card_showcases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "binder_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "showcase_type" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "binder_card_showcases_showcase_type_check" CHECK (("showcase_type" = ANY (ARRAY['favorite'::"text", 'chase'::"text"])))
);


--
-- Name: binder_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."binder_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "binder_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "slot_order" integer DEFAULT 0 NOT NULL,
    "owned" boolean DEFAULT false NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "api_card_id" "text",
    "card_name" "text",
    "api_set_id" "text",
    "card_number" "text",
    "image_url" "text",
    "set_name" "text",
    "set_total" integer,
    "ebay_price" numeric,
    "tcg_price" numeric,
    "cardmarket_price" numeric,
    "last_price_update" timestamp with time zone,
    "condition" "text" DEFAULT 'Near Mint'::"text",
    "grade_company" "text",
    "grade" "text",
    "owned_quantity" integer DEFAULT 1 NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    CONSTRAINT "binder_cards_owned_quantity_check" CHECK (("owned_quantity" >= 1))
);


--
-- Name: COLUMN "binder_cards"."grade_company"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binder_cards"."grade_company" IS 'Grading company for this specific binder card, for example PSA, CGC, BGS, or Ace.';


--
-- Name: COLUMN "binder_cards"."grade"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binder_cards"."grade" IS 'Grade for this specific binder card, for example 10, 9.5, or 9.';


--
-- Name: COLUMN "binder_cards"."owned_quantity"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binder_cards"."owned_quantity" IS 'Number of copies owned for this binder card. Values above 1 are shown as a card badge.';


--
-- Name: COLUMN "binder_cards"."language"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."binder_cards"."language" IS 'Card print language for binder ownership rows.';


--
-- Name: canonical_card_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."canonical_card_concepts" (
    "id" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "pokemon_dex_ids" integer[] DEFAULT '{}'::integer[] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: card_clip_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_clip_embeddings" (
    "card_id" "text" NOT NULL,
    "model" "text" NOT NULL,
    "dimensions" integer NOT NULL,
    "embedding" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "card_clip_embeddings"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."card_clip_embeddings" IS 'Precomputed CLIP image embeddings for pokemon_cards, used to rerank ambiguous OCR scan matches.';


--
-- Name: card_fingerprints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_fingerprints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "card_name" "text" NOT NULL,
    "set_name" "text",
    "set_id" "text",
    "image_url" "text",
    "phash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fingerprints" "jsonb",
    "algorithm_version" integer DEFAULT 1 NOT NULL
);


--
-- Name: COLUMN "card_fingerprints"."fingerprints"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."card_fingerprints"."fingerprints" IS 'Region-based perceptual hashes keyed by region name, for example full/art/name/lower/center.';


--
-- Name: COLUMN "card_fingerprints"."algorithm_version"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."card_fingerprints"."algorithm_version" IS 'Fingerprint algorithm version used to generate phash/fingerprints.';


--
-- Name: card_image_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_image_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text",
    "provider" "text" NOT NULL,
    "provider_image_base" "text",
    "candidate_url" "text",
    "http_status" integer,
    "content_type" "text",
    "image_width" integer,
    "image_height" integer,
    "resolution_status" "text" NOT NULL,
    "failure_reason" "text",
    "checked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: card_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_image_base" "text",
    "resolved_image_url" "text",
    "resolved_format" "text",
    "resolved_quality" "text",
    "image_width" integer,
    "image_height" integer,
    "content_type" "text",
    "resolution_status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "resolution_source" "text" DEFAULT 'tcgdex'::"text" NOT NULL,
    "variants" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_verified_at" timestamp with time zone,
    "failure_reason" "text",
    "retry_after" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: card_previews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_previews" (
    "card_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "set_name" "text",
    "image_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: card_price_checks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_price_checks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_type" "text" DEFAULT 'card'::"text" NOT NULL,
    "language" "text" NOT NULL,
    "region" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_record_id" "text",
    "pricing_status" "text" NOT NULL,
    "last_checked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "next_check_at" timestamp with time zone,
    "failure_reason" "text",
    "provider_coverage" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: card_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_type" "text" DEFAULT 'card'::"text" NOT NULL,
    "language" "text" NOT NULL,
    "region" "text" NOT NULL,
    "condition" "text" DEFAULT 'raw'::"text" NOT NULL,
    "grader" "text",
    "grade" "text",
    "currency" "text" NOT NULL,
    "price_type" "text" NOT NULL,
    "low" numeric,
    "market" numeric,
    "average" numeric,
    "high" numeric,
    "last_sold" numeric,
    "sales_count" integer,
    "original_price" numeric,
    "original_currency" "text",
    "exchange_rate" numeric,
    "exchange_rate_timestamp" timestamp with time zone,
    "display_price" numeric,
    "display_currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_record_id" "text",
    "provider_updated_at" timestamp with time zone,
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confidence" "text" DEFAULT 'medium'::"text" NOT NULL,
    "pricing_status" "text" DEFAULT 'priced'::"text" NOT NULL,
    "failure_reason" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: card_printings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_printings" (
    "id" "text" NOT NULL,
    "concept_id" "text",
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "collector_number" "text",
    "variant" "text" DEFAULT 'normal'::"text" NOT NULL,
    "rarity" "text",
    "image_small_url" "text",
    "image_large_url" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_status" "text" DEFAULT 'needs_review'::"text",
    "pricing_status" "text" DEFAULT 'unsupported'::"text",
    "raw_source" "jsonb"
);


--
-- Name: card_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."card_variants" (
    "id" "text" NOT NULL,
    "card_id" "text" NOT NULL,
    "printing_id" "text",
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "variant_type" "text" NOT NULL,
    "variant_label" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text",
    "confidence" "text" DEFAULT 'medium'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cards" (
    "card_id" "text" NOT NULL,
    "name" "text",
    "set_id" "text",
    "image_url" "text"
);


--
-- Name: catalogue_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."catalogue_sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'tcgdex'::"text" NOT NULL,
    "job_name" "text" NOT NULL,
    "language" "text",
    "region" "text",
    "set_id" "text",
    "status" "text" DEFAULT 'running'::"text" NOT NULL,
    "provider_reported_total" integer DEFAULT 0,
    "retrieved_total" integer DEFAULT 0,
    "stored_total" integer DEFAULT 0,
    "missing_total" integer DEFAULT 0,
    "duplicate_total" integer DEFAULT 0,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "duration_ms" integer,
    "summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text"
);


--
-- Name: tcg_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tcg_cards" (
    "id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "concept_id" "text",
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "local_name" "text",
    "english_display_name" "text",
    "collector_number" "text",
    "printed_number" "text",
    "rarity" "text",
    "supertype" "text",
    "subtypes" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "hp" "text",
    "artist" "text",
    "image_small_url" "text",
    "image_large_url" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "data_completeness" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "image_status" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider" "text",
    "provider_card_id" "text",
    "provider_set_id" "text",
    "pricing_status" "text" DEFAULT 'unsupported'::"text",
    "record_status" "text" DEFAULT 'partial'::"text",
    "last_image_checked_at" timestamp with time zone,
    "last_price_checked_at" timestamp with time zone,
    "raw_source" "jsonb"
);


--
-- Name: tcg_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tcg_sets" (
    "id" "text" NOT NULL,
    "series_id" "text",
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "local_name" "text",
    "english_display_name" "text",
    "set_code" "text",
    "printed_total" integer,
    "actual_total" integer,
    "release_date" "date",
    "symbol_url" "text",
    "logo_url" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "data_completeness" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "image_completeness" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_reported_total" integer,
    "retrieved_total" integer,
    "stored_total" integer,
    "missing_total" integer,
    "duplicate_total" integer,
    "sync_status" "text" DEFAULT 'partial'::"text",
    "last_card_sync_at" timestamp with time zone
);


--
-- Name: catalogue_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."catalogue_health" AS
 WITH "latest_images" AS (
         SELECT DISTINCT ON ("card_images"."card_id") "card_images"."card_id",
            "card_images"."resolution_status",
            "card_images"."resolution_source",
            "card_images"."failure_reason",
            "card_images"."last_verified_at"
           FROM "public"."card_images"
          ORDER BY "card_images"."card_id",
                CASE "card_images"."resolution_status"
                    WHEN 'resolved'::"text" THEN 1
                    WHEN 'resolved_secondary'::"text" THEN 2
                    WHEN 'temporarily_unavailable'::"text" THEN 3
                    WHEN 'needs_review'::"text" THEN 4
                    WHEN 'invalid'::"text" THEN 5
                    ELSE 6
                END, "card_images"."last_verified_at" DESC NULLS LAST
        ), "latest_prices" AS (
         SELECT DISTINCT ON ("card_prices"."entity_id") "card_prices"."entity_id",
            "card_prices"."pricing_status",
            "card_prices"."price_type",
            "card_prices"."retrieved_at",
            "card_prices"."confidence"
           FROM "public"."card_prices"
          WHERE ("card_prices"."entity_type" = 'card'::"text")
          ORDER BY "card_prices"."entity_id",
                CASE "card_prices"."price_type"
                    WHEN 'recent_sold'::"text" THEN 1
                    WHEN 'market'::"text" THEN 2
                    WHEN 'average_sold'::"text" THEN 3
                    WHEN 'low_listing'::"text" THEN 4
                    WHEN 'estimated'::"text" THEN 5
                    ELSE 6
                END, "card_prices"."retrieved_at" DESC
        ), "latest_price_checks" AS (
         SELECT DISTINCT ON ("card_price_checks"."entity_id") "card_price_checks"."entity_id",
            "card_price_checks"."pricing_status",
            "card_price_checks"."failure_reason",
            "card_price_checks"."last_checked_at"
           FROM "public"."card_price_checks"
          WHERE ("card_price_checks"."entity_type" = 'card'::"text")
          ORDER BY "card_price_checks"."entity_id", "card_price_checks"."last_checked_at" DESC
        ), "latest_runs" AS (
         SELECT "catalogue_sync_runs"."language",
            "max"("catalogue_sync_runs"."finished_at") FILTER (WHERE ("catalogue_sync_runs"."status" = 'completed'::"text")) AS "last_successful_sync",
            "max"("catalogue_sync_runs"."finished_at") FILTER (WHERE ("catalogue_sync_runs"."job_name" ~~* '%repair%'::"text")) AS "last_repair_run"
           FROM "public"."catalogue_sync_runs"
          GROUP BY "catalogue_sync_runs"."language"
        ), "duplicates" AS (
         SELECT "d_1"."language",
            ("count"(*))::integer AS "duplicate_records"
           FROM ( SELECT "tcg_cards"."language",
                    "tcg_cards"."provider",
                    "tcg_cards"."provider_card_id",
                    "count"(*) AS "duplicate_count"
                   FROM "public"."tcg_cards"
                  WHERE ("tcg_cards"."provider_card_id" IS NOT NULL)
                  GROUP BY "tcg_cards"."language", "tcg_cards"."provider", "tcg_cards"."provider_card_id"
                 HAVING ("count"(*) > 1)) "d_1"
          GROUP BY "d_1"."language"
        )
 SELECT "c"."language",
    "c"."region",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."tcg_sets" "ss"
          WHERE (("ss"."source_provider" = 'tcgdex'::"text") AND ("ss"."language" = 'en'::"text"))) AS "english_sets_stored",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."tcg_sets" "ss"
          WHERE (("ss"."source_provider" = 'tcgdex'::"text") AND ("ss"."language" = 'ja'::"text"))) AS "japanese_sets_stored",
    ("count"(*))::integer AS "cards_stored",
    ("count"(*) FILTER (WHERE ("li"."resolution_status" = ANY (ARRAY['resolved'::"text", 'resolved_secondary'::"text"]))))::integer AS "cards_with_resolved_images",
    ("count"(*) FILTER (WHERE ("li"."resolution_status" = 'resolved_secondary'::"text")))::integer AS "cards_using_secondary_images",
    ("count"(*) FILTER (WHERE (COALESCE("li"."resolution_status", "c"."image_status", 'missing'::"text") <> ALL (ARRAY['resolved'::"text", 'resolved_secondary'::"text"]))))::integer AS "cards_missing_images",
    ("count"(*) FILTER (WHERE (("lp"."pricing_status" = 'priced'::"text") AND ("lp"."retrieved_at" >= ("now"() - '24:00:00'::interval)))))::integer AS "cards_with_current_prices",
    ("count"(*) FILTER (WHERE (("lp"."pricing_status" = 'priced'::"text") AND ("lp"."retrieved_at" < ("now"() - '24:00:00'::interval)))))::integer AS "cards_with_stale_prices",
    ("count"(*) FILTER (WHERE ("lpc"."pricing_status" = 'no_provider_mapping'::"text")))::integer AS "cards_without_provider_mappings",
    ("count"(*) FILTER (WHERE (COALESCE("lpc"."pricing_status", "c"."pricing_status") = ANY (ARRAY['unsupported'::"text", 'no_recent_sales'::"text"]))))::integer AS "cards_with_no_pricing_support",
    ( SELECT ("count"(*))::integer AS "count"
           FROM ("public"."card_image_checks" "cic"
             JOIN "public"."tcg_cards" "c2" ON (("c2"."id" = "cic"."card_id")))
          WHERE (("c2"."language" = "c"."language") AND ("cic"."resolution_status" <> ALL (ARRAY['resolved'::"text", 'resolved_secondary'::"text"])))) AS "image_resolution_failures",
    ( SELECT ("count"(*))::integer AS "count"
           FROM "public"."card_price_checks" "cpc"
          WHERE (("cpc"."language" = "c"."language") AND ("cpc"."pricing_status" <> ALL (ARRAY['priced'::"text", 'partially_priced'::"text"])))) AS "pricing_provider_failures",
    COALESCE("d"."duplicate_records", 0) AS "duplicate_records",
    "lr"."last_successful_sync",
    "lr"."last_repair_run"
   FROM (((((("public"."tcg_cards" "c"
     LEFT JOIN "public"."tcg_sets" "s" ON (("s"."id" = "c"."set_id")))
     LEFT JOIN "latest_images" "li" ON (("li"."card_id" = "c"."id")))
     LEFT JOIN "latest_prices" "lp" ON (("lp"."entity_id" = "c"."id")))
     LEFT JOIN "latest_price_checks" "lpc" ON (("lpc"."entity_id" = "c"."id")))
     LEFT JOIN "latest_runs" "lr" ON (("lr"."language" = "c"."language")))
     LEFT JOIN "duplicates" "d" ON (("d"."language" = "c"."language")))
  WHERE (("c"."provider" = 'tcgdex'::"text") OR ("c"."source_provider" = 'tcgdex'::"text"))
  GROUP BY "c"."language", "c"."region", "d"."duplicate_records", "lr"."last_successful_sync", "lr"."last_repair_run";


--
-- Name: catalogue_review_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."catalogue_review_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "region" "text",
    "language" "text",
    "reason" "text" NOT NULL,
    "match_candidates" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'needs_review'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: catalogue_sync_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."catalogue_sync_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_run_id" "uuid",
    "provider" "text" DEFAULT 'tcgdex'::"text" NOT NULL,
    "job_name" "text",
    "language" "text",
    "region" "text",
    "set_id" "text",
    "card_id" "text",
    "provider_record_id" "text",
    "stage" "text" NOT NULL,
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: community_news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."community_news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "category" "text" DEFAULT 'Latest'::"text" NOT NULL,
    "icon" "text" DEFAULT 'newspaper-outline'::"text" NOT NULL,
    "external_url" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "published_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_name" "text",
    "source_type" "text",
    "source_url" "text"
);


--
-- Name: cron_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."cron_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text",
    "ran_at" timestamp without time zone DEFAULT "now"(),
    "status" "text",
    "details" "text"
);


--
-- Name: feed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."feed_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "card_name" "text",
    "set_name" "text",
    "card_number" "text",
    "image_url" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid" NOT NULL,
    "following_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'blocked'::"text"]))),
    CONSTRAINT "no_self_friendship" CHECK (("requester_id" <> "receiver_id"))
);


--
-- Name: japanese_catalogue_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."japanese_catalogue_health" AS
SELECT
    NULL::"text" AS "set_id",
    NULL::"text" AS "source_provider",
    NULL::"text" AS "source_id",
    NULL::"text" AS "local_name",
    NULL::"text" AS "english_display_name",
    NULL::"text" AS "set_code",
    NULL::"date" AS "release_date",
    NULL::integer AS "printed_total",
    NULL::integer AS "actual_total",
    NULL::integer AS "stored_total",
    NULL::integer AS "cards_with_metadata",
    NULL::integer AS "cards_with_small_image",
    NULL::integer AS "cards_with_large_image",
    NULL::integer AS "cards_with_price",
    NULL::integer AS "cards_missing_price",
    NULL::integer AS "cards_missing_image",
    NULL::integer AS "cards_unmatched",
    NULL::integer AS "sealed_products_linked",
    NULL::timestamp with time zone AS "last_successful_sync",
    NULL::"text" AS "current_status";


--
-- Name: VIEW "japanese_catalogue_health"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW "public"."japanese_catalogue_health" IS 'Administrative coverage view for Japanese catalogue metadata, images, products and pricing. Complete means expected records were processed and missing fields are accounted for.';


--
-- Name: local_featured_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_featured_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "venue_name" "text",
    "address" "text",
    "town" "text",
    "postcode" "text",
    "country" "text" DEFAULT 'UK'::"text",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "external_url" "text",
    "image_url" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "is_admin_featured" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latitude" double precision,
    "longitude" double precision
);


--
-- Name: local_meetup_attendees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_meetup_attendees" (
    "meetup_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'going'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "local_meetup_attendees_status_check" CHECK (("status" = ANY (ARRAY['going'::"text", 'interested'::"text", 'cancelled'::"text"])))
);


--
-- Name: local_meetups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_meetups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "location_name" "text" NOT NULL,
    "address" "text",
    "town" "text",
    "postcode" "text",
    "country" "text" DEFAULT 'UK'::"text",
    "latitude" numeric,
    "longitude" numeric,
    "starts_at" timestamp with time zone,
    "max_attendees" integer,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "local_meetups_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'cancelled'::"text"])))
);


--
-- Name: local_stores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."local_stores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "address" "text",
    "town" "text",
    "postcode" "text",
    "country" "text" DEFAULT 'UK'::"text",
    "latitude" numeric,
    "longitude" numeric,
    "website_url" "text",
    "phone" "text",
    "image_url" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: market_price_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_price_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "tcg_low" numeric,
    "tcg_mid" numeric,
    "cardmarket_trend" numeric,
    "ebay_low" numeric,
    "ebay_average" numeric,
    "ebay_high" numeric,
    "ebay_count" integer,
    "snapshot_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "tcgdex_card_id" "text",
    "tcgdex_price" numeric,
    "tcgdex_price_updated_at" timestamp with time zone,
    "price_source" "text",
    "source_payload" "jsonb",
    "canonical_identity_key" "text",
    "market_price_gbp" numeric,
    "low_price_gbp" numeric,
    "high_price_gbp" numeric,
    "ebay_sold_estimate_gbp" numeric,
    "secondary_consensus_gbp" numeric,
    "active_listing_indication_gbp" numeric,
    "confidence_score" numeric,
    "confidence_label" "text",
    "confidence_explanation" "text",
    "comp_count" integer,
    "sold_comp_count" integer,
    "active_listing_count" integer,
    "source_count" integer,
    "volatility" numeric,
    "primary_source" "text",
    "price_type" "text",
    "methodology_version" "text",
    "calculated_at" timestamp with time zone,
    "stale_after" timestamp with time zone,
    "is_stale" boolean DEFAULT false NOT NULL,
    "source_breakdown" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "pricing_identity_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "calculation_summary" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: COLUMN "market_price_snapshots"."language"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_price_snapshots"."language" IS 'Pricing language lane so English and Japanese market prices do not overwrite each other.';


--
-- Name: COLUMN "market_price_snapshots"."tcgdex_price"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_price_snapshots"."tcgdex_price" IS 'Preferred GBP price resolved from TCGdex pricing data.';


--
-- Name: COLUMN "market_price_snapshots"."canonical_identity_key"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_price_snapshots"."canonical_identity_key" IS 'Deterministic product identity key: product type, language, set, number, variant, finish, edition, grader, grade and condition.';


--
-- Name: market_prices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "currency" "text" NOT NULL,
    "condition" "text",
    "grader" "text",
    "grade" "text",
    "price_type" "text" NOT NULL,
    "low" numeric,
    "average" numeric,
    "market" numeric,
    "high" numeric,
    "last_sold" numeric,
    "sales_count" integer,
    "original_price" numeric,
    "original_currency" "text",
    "display_price" numeric,
    "display_currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "exchange_rate" numeric,
    "exchange_rate_timestamp" timestamp with time zone,
    "source_provider" "text" NOT NULL,
    "source_url" "text",
    "provider_updated_at" timestamp with time zone,
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confidence" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "pricing_status" "text" DEFAULT 'priced'::"text",
    "next_check_at" timestamp with time zone,
    "failure_reason" "text"
);


--
-- Name: market_product_price_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_product_price_snapshots" (
    "id" bigint NOT NULL,
    "product_id" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "ebay_low" numeric,
    "ebay_average" numeric,
    "ebay_high" numeric,
    "sold_count" integer,
    "query" "text",
    "source" "text",
    "snapshot_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "tcg_low" numeric,
    "tcg_mid" numeric,
    "tcg_market" numeric,
    "tcg_product_id" integer
);


--
-- Name: TABLE "market_product_price_snapshots"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."market_product_price_snapshots" IS 'Cached live product price snapshots, currently derived from eBay sold-comps.';


--
-- Name: COLUMN "market_product_price_snapshots"."tcg_low"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_product_price_snapshots"."tcg_low" IS 'Latest TCGCSV low product price in GBP.';


--
-- Name: COLUMN "market_product_price_snapshots"."tcg_mid"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_product_price_snapshots"."tcg_mid" IS 'Latest TCGCSV mid product price in GBP.';


--
-- Name: COLUMN "market_product_price_snapshots"."tcg_market"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_product_price_snapshots"."tcg_market" IS 'Latest TCGCSV market product price in GBP.';


--
-- Name: COLUMN "market_product_price_snapshots"."tcg_product_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."market_product_price_snapshots"."tcg_product_id" IS 'Matched TCGPlayer/TCGCSV product id.';


--
-- Name: market_product_price_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."market_product_price_snapshots" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."market_product_price_snapshots_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: market_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_products" (
    "id" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "set_name" "text",
    "image_url" "text",
    "image_large_url" "text",
    "aliases" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "source" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text",
    "region" "text",
    "release_year" "text",
    "source_provider" "text",
    "source_id" "text",
    "confidence" "text",
    "data_completeness" "text",
    "image_status" "text"
);


--
-- Name: TABLE "market_products"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."market_products" IS 'Searchable product catalog for sealed products, ETBs, booster boxes, bundles, and accessories.';


--
-- Name: market_watchlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."market_watchlist" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: marketplace_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."marketplace_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "custom_value" numeric,
    "condition" "text",
    "notes" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketplace_listings_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'sold'::"text"])))
);


--
-- Name: milestone_definitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."milestone_definitions" (
    "id" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" NOT NULL,
    "icon" "text",
    "category" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "card_id" "text",
    "set_id" "text",
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: pokemap_saved_shops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pokemap_saved_shops" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "shop_name" "text" NOT NULL,
    "address" "text",
    "postcode" "text",
    "lat" double precision,
    "lng" double precision,
    "is_chain" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "saved_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: pokemon_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pokemon_cards" (
    "id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "number" "text",
    "rarity" "text",
    "image_small" "text",
    "image_large" "text",
    "raw_data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "region" "text",
    "external_ids" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "image_status" "text" DEFAULT 'needs_review'::"text",
    "pricing_status" "text" DEFAULT 'unsupported'::"text",
    "last_image_checked_at" timestamp with time zone,
    "last_price_checked_at" timestamp with time zone
);


--
-- Name: COLUMN "pokemon_cards"."language"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."pokemon_cards"."language" IS 'Card print language. English cards use en; Japanese cards use ja.';


--
-- Name: pokemon_sets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pokemon_sets" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "series" "text",
    "printed_total" integer,
    "total" integer,
    "release_date" "date",
    "symbol_url" "text",
    "logo_url" "text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "region" "text",
    "external_ids" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: COLUMN "pokemon_sets"."language"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."pokemon_sets"."language" IS 'Set language. English sets use en; Japanese sets use ja.';


--
-- Name: poketrace_api_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poketrace_api_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "cache_key" "text" NOT NULL,
    "response" "jsonb" NOT NULL,
    "cached_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


--
-- Name: TABLE "poketrace_api_cache"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."poketrace_api_cache" IS 'Server-side cache for PokeTrace card and history responses. Accessed only by the backend service role.';


--
-- Name: price_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."price_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text",
    "card_name" "text",
    "target_price" numeric NOT NULL,
    "direction" "text" NOT NULL,
    "triggered" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "price_alerts_direction_check" CHECK (("direction" = ANY (ARRAY['below'::"text", 'above'::"text"])))
);


--
-- Name: price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."price_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "market_price_id" "uuid",
    "entity_id" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "price_type" "text" NOT NULL,
    "display_price" numeric,
    "display_currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "original_price" numeric,
    "original_currency" "text",
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_provider" "text" NOT NULL,
    "confidence" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: price_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."price_observations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stackr_card_id" "text",
    "card_id" "text",
    "canonical_identity_key" "text",
    "observation_hash" "text",
    "source_id" "text",
    "source" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "source_type" "text" DEFAULT 'market_estimate'::"text" NOT NULL,
    "external_reference" "text",
    "product_type" "text",
    "title" "text",
    "original_item_price" numeric,
    "original_shipping_price" numeric,
    "original_currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "normalised_item_price_gbp" numeric,
    "normalised_delivered_price_gbp" numeric,
    "original_price" numeric,
    "converted_price_gbp" numeric,
    "sold_at" timestamp with time zone,
    "listed_at" timestamp with time zone,
    "fetched_at" timestamp with time zone,
    "observed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "condition" "text",
    "raw_condition" "text",
    "grader" "text",
    "grading_company" "text",
    "grade" "text",
    "grade_label" "text",
    "variant" "text",
    "finish" "text",
    "edition" "text",
    "match_confidence" numeric DEFAULT 0 NOT NULL,
    "match_score" numeric,
    "match_explanation" "text",
    "source_reliability" numeric,
    "included_in_estimate" boolean,
    "excluded" boolean DEFAULT false NOT NULL,
    "exclusion_reason" "text",
    "listing_url" "text",
    "shipping_included" boolean DEFAULT false NOT NULL,
    "verified_sale" boolean DEFAULT false NOT NULL,
    "metadata_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "price_observations_source_type_check" CHECK (("source_type" = ANY (ARRAY['active_listing'::"text", 'sold_listing'::"text", 'sold_transaction'::"text", 'market_price'::"text", 'market_estimate'::"text"])))
);


--
-- Name: COLUMN "price_observations"."source_type"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."price_observations"."source_type" IS 'V2 keeps sold_transaction, market_estimate and active_listing separate. Active listings must never be presented as sold comps.';


--
-- Name: pricing_review_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pricing_review_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "canonical_identity_key" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "disagreement_percentage" numeric,
    "priority" integer DEFAULT 50 NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "resolution_notes" "text",
    CONSTRAINT "pricing_review_queue_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_review'::"text", 'resolved'::"text", 'ignored'::"text"])))
);


--
-- Name: TABLE "pricing_review_queue"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."pricing_review_queue" IS 'Cards requiring human review due to source disagreement, no exact match or other pricing-quality issues.';


--
-- Name: pricing_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."pricing_sources" (
    "id" "text" NOT NULL,
    "source_name" "text" NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "source_type" "text" NOT NULL,
    "reliability_weight" numeric DEFAULT 0.3 NOT NULL,
    "supports_sold_data" boolean DEFAULT false NOT NULL,
    "supports_active_data" boolean DEFAULT false NOT NULL,
    "refresh_interval" interval,
    "rate_limit_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_success_at" timestamp with time zone,
    "last_failure_at" timestamp with time zone,
    "consecutive_failures" integer DEFAULT 0 NOT NULL,
    "health_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: TABLE "pricing_sources"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE "public"."pricing_sources" IS 'Pricing Engine V2 provider registry. eBay sold remains disabled until authorised completed-sale access is configured.';


--
-- Name: trade_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trade_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewed_user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviewer_cannot_review_self" CHECK (("reviewer_id" <> "reviewed_user_id")),
    CONSTRAINT "trade_reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


--
-- Name: profile_rating_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."profile_rating_summary" WITH ("security_invoker"='true') AS
 SELECT "reviewed_user_id" AS "user_id",
    "round"("avg"("rating"), 2) AS "average_rating",
    ("count"(*))::integer AS "review_count"
   FROM "public"."trade_reviews"
  GROUP BY "reviewed_user_id";


--
-- Name: provider_card_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."provider_card_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "provider_record_type" "text" DEFAULT 'card'::"text" NOT NULL,
    "provider_record_id" "text" NOT NULL,
    "language" "text" NOT NULL,
    "region" "text" NOT NULL,
    "source_url" "text",
    "response_status" "text" DEFAULT 'complete'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: provider_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."provider_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "stackr_card_id" "text",
    "provider" "text" NOT NULL,
    "provider_card_id" "text" NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_record_type" "text",
    "provider_record_id" "text",
    "stackr_entity_type" "text",
    "stackr_entity_id" "text",
    "match_method" "text",
    "match_confidence" numeric,
    "match_status" "text" DEFAULT 'matched'::"text" NOT NULL,
    "last_verified_at" timestamp with time zone
);


--
-- Name: provider_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."provider_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "provider_record_type" "text" NOT NULL,
    "provider_record_id" "text" NOT NULL,
    "region" "text",
    "language" "text" DEFAULT ''::"text" NOT NULL,
    "retrieved_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "response_status" "text" DEFAULT 'success'::"text" NOT NULL,
    "source_url" "text",
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: scan_training_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."scan_training_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "card_id" "text" NOT NULL,
    "image_base64" "text" NOT NULL,
    "confirmed_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: sealed_product_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sealed_product_variants" (
    "id" "text" NOT NULL,
    "product_id" "text" NOT NULL,
    "variant_type" "text" NOT NULL,
    "variant_label" "text",
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "quantity" integer,
    "image_url" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text",
    "confidence" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: sealed_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sealed_products" (
    "id" "text" NOT NULL,
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "product_type" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "local_name" "text",
    "english_display_name" "text",
    "set_id" "text",
    "release_date" "date",
    "pack_count" integer,
    "cards_per_pack" integer,
    "box_configuration" "text",
    "manufacturer_product_code" "text",
    "barcode" "text",
    "image_front_url" "text",
    "image_back_url" "text",
    "image_side_url" "text",
    "image_source" "text",
    "image_license_status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "image_verified" boolean DEFAULT false NOT NULL,
    "image_last_checked" timestamp with time zone,
    "source_provider" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "data_completeness" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "image_status" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "confidence" "text" DEFAULT 'unavailable'::"text" NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: seller_inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."seller_inventory_items" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text",
    "condition" "text" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "asking_price" numeric,
    "buy_price" numeric,
    "notes" "text",
    "card_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seller_inventory_items_quantity_check" CHECK (("quantity" >= 0))
);


--
-- Name: COLUMN "seller_inventory_items"."card_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."seller_inventory_items"."card_id" IS 'Pokemon card id for card stock, or product:<type>:<slug> for sealed products and accessories.';


--
-- Name: seller_sale_transaction_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."seller_sale_transaction_items" (
    "id" bigint NOT NULL,
    "transaction_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "inventory_item_id" "text",
    "card_id" "text" NOT NULL,
    "card_name" "text" NOT NULL,
    "set_name" "text",
    "condition" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "estimated_unit_price" numeric,
    "image_small" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "seller_sale_transaction_items_quantity_check" CHECK (("quantity" > 0))
);


--
-- Name: COLUMN "seller_sale_transaction_items"."card_id"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN "public"."seller_sale_transaction_items"."card_id" IS 'Pokemon card id for card sale lines, or product:<type>:<slug> for product sale lines.';


--
-- Name: seller_sale_transaction_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE "public"."seller_sale_transaction_items" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."seller_sale_transaction_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: seller_sale_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."seller_sale_transactions" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "sold_price" numeric,
    "estimated_value" numeric DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: social_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."social_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "post_type" "text" DEFAULT 'general_post'::"text" NOT NULL,
    "body" "text",
    "card_id" "text",
    "set_id" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "binder_id" "uuid"
);


--
-- Name: sync_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sync_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sync_run_id" "uuid",
    "provider" "text" NOT NULL,
    "sync_name" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "text",
    "error_type" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."sync_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "sync_name" "text" NOT NULL,
    "region" "text",
    "language" "text",
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "records_requested" integer DEFAULT 0 NOT NULL,
    "records_retrieved" integer DEFAULT 0 NOT NULL,
    "records_written" integer DEFAULT 0 NOT NULL,
    "records_skipped" integer DEFAULT 0 NOT NULL,
    "missing_records" integer DEFAULT 0 NOT NULL,
    "duplicate_records" integer DEFAULT 0 NOT NULL,
    "failed_mappings" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text"
);


--
-- Name: tcg_card_printings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."tcg_card_printings" AS
 SELECT "cp"."id",
    COALESCE("cp"."language", "c"."language") AS "language",
    COALESCE("cp"."region", "c"."region") AS "region",
    "cp"."set_id",
    COALESCE("c"."local_name", "c"."canonical_name", "c"."id") AS "local_name",
    COALESCE("c"."english_display_name", "c"."canonical_name", "c"."local_name", "c"."id") AS "english_display_name",
    "cp"."collector_number",
    "cp"."rarity",
    NULL::"text" AS "variant",
    COALESCE("cp"."source_provider", "c"."provider", 'tcgdex'::"text") AS "source_provider",
    COALESCE("cp"."source_id", "c"."provider_card_id", "c"."id") AS "source_id",
    COALESCE("cp"."image_status", "c"."image_status", 'needs_review'::"text") AS "image_status",
    COALESCE("cp"."pricing_status", "c"."pricing_status", 'unsupported'::"text") AS "pricing_status",
    "cp"."created_at" AS "last_synced_at"
   FROM ("public"."card_printings" "cp"
     LEFT JOIN "public"."tcg_cards" "c" ON (("c"."id" = "cp"."card_id")));


--
-- Name: tcg_series; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tcg_series" (
    "id" "text" NOT NULL,
    "game" "text" DEFAULT 'pokemon'::"text" NOT NULL,
    "region" "text" NOT NULL,
    "language" "text" NOT NULL,
    "canonical_name" "text" NOT NULL,
    "local_name" "text",
    "source_provider" "text" NOT NULL,
    "source_id" "text" NOT NULL,
    "display_order" integer,
    "raw_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tcg_set_cover_images; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW "public"."tcg_set_cover_images" AS
 WITH "ranked_cover_images" AS (
         SELECT "c"."set_id",
            "c"."id" AS "card_id",
            "c"."language",
            "c"."region",
            "c"."collector_number",
            COALESCE(NULLIF(("ci"."variants" ->> 'grid'::"text"), ''::"text"), NULLIF(("ci"."variants" ->> 'detail'::"text"), ''::"text"), NULLIF(("ci"."variants" ->> 'thumbnail'::"text"), ''::"text"), NULLIF("ci"."resolved_image_url", ''::"text"), NULLIF("c"."image_small_url", ''::"text"), NULLIF("c"."image_large_url", ''::"text")) AS "cover_image_url",
            "row_number"() OVER (PARTITION BY "c"."set_id" ORDER BY
                CASE
                    WHEN (COALESCE("ci"."resolution_status", "c"."image_status") = ANY (ARRAY['resolved'::"text", 'resolved_secondary'::"text"])) THEN 0
                    WHEN (("c"."image_small_url" IS NOT NULL) OR ("c"."image_large_url" IS NOT NULL)) THEN 1
                    ELSE 2
                END,
                CASE
                    WHEN ("c"."collector_number" ~ '^[0-9]+$'::"text") THEN ("c"."collector_number")::integer
                    ELSE 999999
                END, "c"."collector_number", "c"."id") AS "rank"
           FROM ("public"."tcg_cards" "c"
             LEFT JOIN LATERAL ( SELECT "ci_1"."id",
                    "ci_1"."card_id",
                    "ci_1"."provider",
                    "ci_1"."provider_image_base",
                    "ci_1"."resolved_image_url",
                    "ci_1"."resolved_format",
                    "ci_1"."resolved_quality",
                    "ci_1"."image_width",
                    "ci_1"."image_height",
                    "ci_1"."content_type",
                    "ci_1"."resolution_status",
                    "ci_1"."resolution_source",
                    "ci_1"."variants",
                    "ci_1"."last_verified_at",
                    "ci_1"."failure_reason",
                    "ci_1"."retry_after",
                    "ci_1"."created_at",
                    "ci_1"."updated_at"
                   FROM "public"."card_images" "ci_1"
                  WHERE (("ci_1"."card_id" = "c"."id") AND ("ci_1"."resolution_status" = ANY (ARRAY['resolved'::"text", 'resolved_secondary'::"text"])) AND ("ci_1"."resolved_image_url" IS NOT NULL))
                  ORDER BY "ci_1"."last_verified_at" DESC NULLS LAST, "ci_1"."updated_at" DESC NULLS LAST
                 LIMIT 1) "ci" ON (true))
          WHERE (COALESCE(NULLIF(("ci"."variants" ->> 'grid'::"text"), ''::"text"), NULLIF(("ci"."variants" ->> 'detail'::"text"), ''::"text"), NULLIF(("ci"."variants" ->> 'thumbnail'::"text"), ''::"text"), NULLIF("ci"."resolved_image_url", ''::"text"), NULLIF("c"."image_small_url", ''::"text"), NULLIF("c"."image_large_url", ''::"text")) IS NOT NULL)
        )
 SELECT "set_id",
    "card_id",
    "language",
    "region",
    "collector_number",
    "cover_image_url"
   FROM "ranked_cover_images"
  WHERE ("rank" = 1);


--
-- Name: trade_cash_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_cash_terms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "payer_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'GBP'::"text" NOT NULL,
    "paypal_me_username" "text",
    "paypal_email" "text",
    "payment_status" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "trade_cash_terms_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "trade_cash_terms_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['not_required'::"text", 'required'::"text", 'sent'::"text", 'confirmed'::"text", 'failed'::"text"])))
);


--
-- Name: trade_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "card_key" "text" NOT NULL,
    "card_id" "text",
    "set_id" "text",
    "set_name" "text",
    "card_name" "text" NOT NULL,
    "image_url" "text",
    "rarity" "text",
    "finish" "text",
    "condition" "text",
    "market_price" numeric(10,2),
    "notes" "text",
    "status" "text" DEFAULT 'live'::"text" NOT NULL,
    "is_public" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asking_price" numeric,
    CONSTRAINT "trade_listings_status_check" CHECK (("status" = ANY (ARRAY['live'::"text", 'reserved'::"text", 'traded'::"text", 'removed'::"text"])))
);


--
-- Name: trade_offer_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_offer_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text",
    "condition" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: trade_offer_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_offer_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "offer_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "note" "text",
    "proposed_status" "text",
    "proposed_cash_amount" numeric,
    "proposed_cards" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trade_offer_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['message'::"text", 'counter_offer'::"text", 'offer_created'::"text", 'pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text", 'payment_required'::"text", 'payment_sent'::"text", 'payment_confirmed'::"text", 'sent'::"text", 'received'::"text", 'completed'::"text", 'disputed'::"text"])))
);


--
-- Name: trade_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trade_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "listing_id" "uuid",
    "from_user" "uuid",
    "sender_sent" boolean DEFAULT false NOT NULL,
    "receiver_sent" boolean DEFAULT false NOT NULL,
    "sender_received" boolean DEFAULT false NOT NULL,
    "receiver_received" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "declined_at" timestamp with time zone,
    CONSTRAINT "trade_offers_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'cancelled'::"text", 'payment_required'::"text", 'payment_sent'::"text", 'payment_confirmed'::"text", 'sent'::"text", 'received'::"text", 'completed'::"text", 'disputed'::"text"])))
);


--
-- Name: trader_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trader_ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trade_offer_id" "uuid" NOT NULL,
    "reviewer_id" "uuid" NOT NULL,
    "reviewed_user_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "review" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "no_self_rating" CHECK (("reviewer_id" <> "reviewed_user_id")),
    CONSTRAINT "trader_ratings_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


--
-- Name: trades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."trades" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "listing_id" "uuid",
    "offer_id" "uuid",
    "seller_id" "uuid",
    "buyer_id" "uuid",
    "status" "text" DEFAULT 'agreed'::"text",
    "buyer_sent" boolean DEFAULT false,
    "seller_sent" boolean DEFAULT false,
    "buyer_received" boolean DEFAULT false,
    "seller_received" boolean DEFAULT false,
    "created_at" timestamp without time zone DEFAULT "now"()
);


--
-- Name: user_achievement_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_achievement_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_achievements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_achievements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "achievement_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: user_card_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_card_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text",
    "flag_type" "text" NOT NULL,
    "condition" "text",
    "notes" "text",
    "value" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "asking_price" numeric,
    "market_estimate" numeric,
    "trade_only" boolean DEFAULT false,
    "has_damage" boolean DEFAULT false,
    "damage_notes" "text",
    "damage_image_url" "text",
    "listing_notes" "text",
    "listing_status" "text" DEFAULT 'active'::"text",
    "listing_images" "jsonb" DEFAULT '[]'::"jsonb",
    "payment_intent_id" "text",
    "product_type" "text" DEFAULT 'raw_card'::"text",
    "product_name" "text",
    "pricing_mode" "text" DEFAULT 'raw'::"text",
    "grade_company" "text",
    "grade" "text",
    "admin_review_required" boolean DEFAULT false,
    "admin_review_reason" "text",
    CONSTRAINT "user_card_flags_flag_type_check" CHECK (("flag_type" = ANY (ARRAY['trade'::"text", 'wishlist'::"text"])))
);


--
-- Name: user_card_variants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_card_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "variant" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "quantity" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "user_card_variants_quantity_check" CHECK (("quantity" >= 1))
);


--
-- Name: user_coin_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_coin_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "reason" "text" NOT NULL,
    "achievement_id" "text",
    "cosmetic_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_coin_ledger_non_zero_amount" CHECK (("amount" <> 0))
);


--
-- Name: user_cosmetics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_cosmetics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "cosmetic_id" "text" NOT NULL,
    "source" "text" DEFAULT 'coins'::"text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


--
-- Name: user_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_follows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "follower_id" "uuid",
    "following_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


--
-- Name: user_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_milestones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "milestone_id" "text" NOT NULL,
    "unlocked_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_pokedex_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_pokedex_cards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: wanted_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."wanted_cards" (
    "user_id" "uuid" NOT NULL,
    "card_id" "text" NOT NULL,
    "set_id" "text" NOT NULL,
    "card_name" "text" NOT NULL,
    "set_name" "text",
    "card_number" "text",
    "image_url" "text",
    "rarity" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: activity_feed activity_feed_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_pkey" PRIMARY KEY ("id");


--
-- Name: activity_reactions activity_reactions_activity_id_user_id_reaction_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_reactions"
    ADD CONSTRAINT "activity_reactions_activity_id_user_id_reaction_key" UNIQUE ("activity_id", "user_id", "reaction");


--
-- Name: activity_reactions activity_reactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_reactions"
    ADD CONSTRAINT "activity_reactions_pkey" PRIMARY KEY ("id");


--
-- Name: binder_card_showcases binder_card_showcases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_card_showcases"
    ADD CONSTRAINT "binder_card_showcases_pkey" PRIMARY KEY ("id");


--
-- Name: binder_card_showcases binder_card_showcases_user_id_binder_id_card_id_set_id_show_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_card_showcases"
    ADD CONSTRAINT "binder_card_showcases_user_id_binder_id_card_id_set_id_show_key" UNIQUE ("user_id", "binder_id", "card_id", "set_id", "showcase_type");


--
-- Name: binder_cards binder_cards_binder_id_card_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_cards"
    ADD CONSTRAINT "binder_cards_binder_id_card_id_unique" UNIQUE ("binder_id", "card_id");


--
-- Name: binder_cards binder_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_cards"
    ADD CONSTRAINT "binder_cards_pkey" PRIMARY KEY ("id");


--
-- Name: binders binders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binders"
    ADD CONSTRAINT "binders_pkey" PRIMARY KEY ("id");


--
-- Name: canonical_card_concepts canonical_card_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."canonical_card_concepts"
    ADD CONSTRAINT "canonical_card_concepts_pkey" PRIMARY KEY ("id");


--
-- Name: card_clip_embeddings card_clip_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_clip_embeddings"
    ADD CONSTRAINT "card_clip_embeddings_pkey" PRIMARY KEY ("card_id");


--
-- Name: card_fingerprints card_fingerprints_card_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_fingerprints"
    ADD CONSTRAINT "card_fingerprints_card_id_key" UNIQUE ("card_id");


--
-- Name: card_fingerprints card_fingerprints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_fingerprints"
    ADD CONSTRAINT "card_fingerprints_pkey" PRIMARY KEY ("id");


--
-- Name: card_image_checks card_image_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_image_checks"
    ADD CONSTRAINT "card_image_checks_pkey" PRIMARY KEY ("id");


--
-- Name: card_images card_images_card_id_provider_resolution_source_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_images"
    ADD CONSTRAINT "card_images_card_id_provider_resolution_source_key" UNIQUE ("card_id", "provider", "resolution_source");


--
-- Name: card_images card_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_images"
    ADD CONSTRAINT "card_images_pkey" PRIMARY KEY ("id");


--
-- Name: card_previews card_previews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_previews"
    ADD CONSTRAINT "card_previews_pkey" PRIMARY KEY ("card_id");


--
-- Name: card_price_checks card_price_checks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_price_checks"
    ADD CONSTRAINT "card_price_checks_pkey" PRIMARY KEY ("id");


--
-- Name: card_prices card_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_prices"
    ADD CONSTRAINT "card_prices_pkey" PRIMARY KEY ("id");


--
-- Name: card_printings card_printings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_printings"
    ADD CONSTRAINT "card_printings_pkey" PRIMARY KEY ("id");


--
-- Name: card_printings card_printings_source_provider_source_id_language_variant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_printings"
    ADD CONSTRAINT "card_printings_source_provider_source_id_language_variant_key" UNIQUE ("source_provider", "source_id", "language", "variant");


--
-- Name: card_variants card_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_variants"
    ADD CONSTRAINT "card_variants_pkey" PRIMARY KEY ("id");


--
-- Name: cards cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cards"
    ADD CONSTRAINT "cards_pkey" PRIMARY KEY ("card_id");


--
-- Name: catalogue_review_queue catalogue_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."catalogue_review_queue"
    ADD CONSTRAINT "catalogue_review_queue_pkey" PRIMARY KEY ("id");


--
-- Name: catalogue_sync_errors catalogue_sync_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."catalogue_sync_errors"
    ADD CONSTRAINT "catalogue_sync_errors_pkey" PRIMARY KEY ("id");


--
-- Name: catalogue_sync_runs catalogue_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."catalogue_sync_runs"
    ADD CONSTRAINT "catalogue_sync_runs_pkey" PRIMARY KEY ("id");


--
-- Name: community_news community_news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."community_news"
    ADD CONSTRAINT "community_news_pkey" PRIMARY KEY ("id");


--
-- Name: cron_logs cron_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."cron_logs"
    ADD CONSTRAINT "cron_logs_pkey" PRIMARY KEY ("id");


--
-- Name: feed_events feed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feed_events"
    ADD CONSTRAINT "feed_events_pkey" PRIMARY KEY ("id");


--
-- Name: follows follows_follower_id_following_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_pkey" PRIMARY KEY ("id");


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");


--
-- Name: local_featured_events local_featured_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_featured_events"
    ADD CONSTRAINT "local_featured_events_pkey" PRIMARY KEY ("id");


--
-- Name: local_meetup_attendees local_meetup_attendees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_meetup_attendees"
    ADD CONSTRAINT "local_meetup_attendees_pkey" PRIMARY KEY ("meetup_id", "user_id");


--
-- Name: local_meetups local_meetups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_meetups"
    ADD CONSTRAINT "local_meetups_pkey" PRIMARY KEY ("id");


--
-- Name: local_stores local_stores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_stores"
    ADD CONSTRAINT "local_stores_pkey" PRIMARY KEY ("id");


--
-- Name: market_price_snapshots market_price_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_price_snapshots"
    ADD CONSTRAINT "market_price_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: market_prices market_prices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_prices"
    ADD CONSTRAINT "market_prices_pkey" PRIMARY KEY ("id");


--
-- Name: market_product_price_snapshots market_product_price_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_product_price_snapshots"
    ADD CONSTRAINT "market_product_price_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: market_products market_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_pkey" PRIMARY KEY ("id");


--
-- Name: market_watchlist market_watchlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_watchlist"
    ADD CONSTRAINT "market_watchlist_pkey" PRIMARY KEY ("id");


--
-- Name: marketplace_listings marketplace_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id");


--
-- Name: milestone_definitions milestone_definitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."milestone_definitions"
    ADD CONSTRAINT "milestone_definitions_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: friendships one_friendship_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "one_friendship_pair" UNIQUE ("requester_id", "receiver_id");


--
-- Name: user_milestones one_milestone_per_user; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "one_milestone_per_user" UNIQUE ("user_id", "milestone_id");


--
-- Name: trader_ratings one_rating_per_user_per_trade; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trader_ratings"
    ADD CONSTRAINT "one_rating_per_user_per_trade" UNIQUE ("trade_offer_id", "reviewer_id");


--
-- Name: trade_reviews one_review_per_user_per_trade; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_reviews"
    ADD CONSTRAINT "one_review_per_user_per_trade" UNIQUE ("trade_id", "reviewer_id");


--
-- Name: pokemap_saved_shops pokemap_saved_shops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemap_saved_shops"
    ADD CONSTRAINT "pokemap_saved_shops_pkey" PRIMARY KEY ("id");


--
-- Name: pokemap_saved_shops pokemap_saved_shops_user_id_shop_name_postcode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemap_saved_shops"
    ADD CONSTRAINT "pokemap_saved_shops_user_id_shop_name_postcode_key" UNIQUE ("user_id", "shop_name", "postcode");


--
-- Name: pokemon_cards pokemon_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemon_cards"
    ADD CONSTRAINT "pokemon_cards_pkey" PRIMARY KEY ("id");


--
-- Name: pokemon_sets pokemon_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemon_sets"
    ADD CONSTRAINT "pokemon_sets_pkey" PRIMARY KEY ("id");


--
-- Name: poketrace_api_cache poketrace_api_cache_cache_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poketrace_api_cache"
    ADD CONSTRAINT "poketrace_api_cache_cache_key_key" UNIQUE ("cache_key");


--
-- Name: poketrace_api_cache poketrace_api_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poketrace_api_cache"
    ADD CONSTRAINT "poketrace_api_cache_pkey" PRIMARY KEY ("id");


--
-- Name: price_alerts price_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."price_alerts"
    ADD CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: price_history price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_pkey" PRIMARY KEY ("id");


--
-- Name: price_observations price_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."price_observations"
    ADD CONSTRAINT "price_observations_pkey" PRIMARY KEY ("id");


--
-- Name: pricing_review_queue pricing_review_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pricing_review_queue"
    ADD CONSTRAINT "pricing_review_queue_pkey" PRIMARY KEY ("id");


--
-- Name: pricing_sources pricing_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pricing_sources"
    ADD CONSTRAINT "pricing_sources_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_collector_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_collector_name_unique" UNIQUE ("collector_name");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");


--
-- Name: provider_card_records provider_card_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."provider_card_records"
    ADD CONSTRAINT "provider_card_records_pkey" PRIMARY KEY ("id");


--
-- Name: provider_card_records provider_card_records_provider_provider_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."provider_card_records"
    ADD CONSTRAINT "provider_card_records_provider_provider_record_id_key" UNIQUE ("provider", "provider_record_id");


--
-- Name: provider_mappings provider_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."provider_mappings"
    ADD CONSTRAINT "provider_mappings_pkey" PRIMARY KEY ("id");


--
-- Name: provider_mappings provider_mappings_provider_provider_card_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."provider_mappings"
    ADD CONSTRAINT "provider_mappings_provider_provider_card_id_language_key" UNIQUE ("provider", "provider_card_id", "language");


--
-- Name: provider_records provider_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."provider_records"
    ADD CONSTRAINT "provider_records_pkey" PRIMARY KEY ("id");


--
-- Name: scan_training_data scan_training_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."scan_training_data"
    ADD CONSTRAINT "scan_training_data_pkey" PRIMARY KEY ("id");


--
-- Name: sealed_product_variants sealed_product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sealed_product_variants"
    ADD CONSTRAINT "sealed_product_variants_pkey" PRIMARY KEY ("id");


--
-- Name: sealed_products sealed_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sealed_products"
    ADD CONSTRAINT "sealed_products_pkey" PRIMARY KEY ("id");


--
-- Name: sealed_products sealed_products_source_provider_source_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sealed_products"
    ADD CONSTRAINT "sealed_products_source_provider_source_id_language_key" UNIQUE ("source_provider", "source_id", "language");


--
-- Name: seller_inventory_items seller_inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_inventory_items"
    ADD CONSTRAINT "seller_inventory_items_pkey" PRIMARY KEY ("id");


--
-- Name: seller_sale_transaction_items seller_sale_transaction_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_sale_transaction_items"
    ADD CONSTRAINT "seller_sale_transaction_items_pkey" PRIMARY KEY ("id");


--
-- Name: seller_sale_transactions seller_sale_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_sale_transactions"
    ADD CONSTRAINT "seller_sale_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: social_posts social_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id");


--
-- Name: sync_errors sync_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sync_errors"
    ADD CONSTRAINT "sync_errors_pkey" PRIMARY KEY ("id");


--
-- Name: sync_runs sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sync_runs"
    ADD CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id");


--
-- Name: tcg_cards tcg_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_cards"
    ADD CONSTRAINT "tcg_cards_pkey" PRIMARY KEY ("id");


--
-- Name: tcg_cards tcg_cards_source_provider_source_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_cards"
    ADD CONSTRAINT "tcg_cards_source_provider_source_id_language_key" UNIQUE ("source_provider", "source_id", "language");


--
-- Name: tcg_series tcg_series_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_series"
    ADD CONSTRAINT "tcg_series_pkey" PRIMARY KEY ("id");


--
-- Name: tcg_series tcg_series_source_provider_source_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_series"
    ADD CONSTRAINT "tcg_series_source_provider_source_id_language_key" UNIQUE ("source_provider", "source_id", "language");


--
-- Name: tcg_sets tcg_sets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_sets"
    ADD CONSTRAINT "tcg_sets_pkey" PRIMARY KEY ("id");


--
-- Name: tcg_sets tcg_sets_source_provider_source_id_language_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_sets"
    ADD CONSTRAINT "tcg_sets_source_provider_source_id_language_key" UNIQUE ("source_provider", "source_id", "language");


--
-- Name: trade_cash_terms trade_cash_terms_offer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_cash_terms"
    ADD CONSTRAINT "trade_cash_terms_offer_id_key" UNIQUE ("offer_id");


--
-- Name: trade_cash_terms trade_cash_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_cash_terms"
    ADD CONSTRAINT "trade_cash_terms_pkey" PRIMARY KEY ("id");


--
-- Name: trade_listings trade_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_pkey" PRIMARY KEY ("id");


--
-- Name: trade_offer_cards trade_offer_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_cards"
    ADD CONSTRAINT "trade_offer_cards_pkey" PRIMARY KEY ("id");


--
-- Name: trade_offer_events trade_offer_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_events"
    ADD CONSTRAINT "trade_offer_events_pkey" PRIMARY KEY ("id");


--
-- Name: trade_offers trade_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offers"
    ADD CONSTRAINT "trade_offers_pkey" PRIMARY KEY ("id");


--
-- Name: trade_reviews trade_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_reviews"
    ADD CONSTRAINT "trade_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: trader_ratings trader_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trader_ratings"
    ADD CONSTRAINT "trader_ratings_pkey" PRIMARY KEY ("id");


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_pkey" PRIMARY KEY ("id");


--
-- Name: profiles unique_collector_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "unique_collector_name" UNIQUE ("collector_name");


--
-- Name: user_achievement_events user_achievement_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievement_events"
    ADD CONSTRAINT "user_achievement_events_pkey" PRIMARY KEY ("id");


--
-- Name: user_achievements user_achievements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id");


--
-- Name: user_achievements user_achievements_user_id_achievement_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_achievement_id_key" UNIQUE ("user_id", "achievement_id");


--
-- Name: user_card_flags user_card_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_flags"
    ADD CONSTRAINT "user_card_flags_pkey" PRIMARY KEY ("id");


--
-- Name: user_card_flags user_card_flags_user_id_card_id_flag_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_flags"
    ADD CONSTRAINT "user_card_flags_user_id_card_id_flag_type_key" UNIQUE ("user_id", "card_id", "flag_type");


--
-- Name: user_card_variants user_card_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_variants"
    ADD CONSTRAINT "user_card_variants_pkey" PRIMARY KEY ("id");


--
-- Name: user_card_variants user_card_variants_user_id_card_id_set_id_variant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_variants"
    ADD CONSTRAINT "user_card_variants_user_id_card_id_set_id_variant_key" UNIQUE ("user_id", "card_id", "set_id", "variant");


--
-- Name: user_coin_ledger user_coin_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_coin_ledger"
    ADD CONSTRAINT "user_coin_ledger_pkey" PRIMARY KEY ("id");


--
-- Name: user_cosmetics user_cosmetics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_pkey" PRIMARY KEY ("id");


--
-- Name: user_cosmetics user_cosmetics_user_id_cosmetic_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_user_id_cosmetic_id_key" UNIQUE ("user_id", "cosmetic_id");


--
-- Name: user_follows user_follows_follower_id_following_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_follower_id_following_id_key" UNIQUE ("follower_id", "following_id");


--
-- Name: user_follows user_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_pkey" PRIMARY KEY ("id");


--
-- Name: user_milestones user_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_pkey" PRIMARY KEY ("id");


--
-- Name: user_pokedex_cards user_pokedex_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_pokedex_cards"
    ADD CONSTRAINT "user_pokedex_cards_pkey" PRIMARY KEY ("id");


--
-- Name: user_pokedex_cards user_pokedex_cards_user_id_card_id_set_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_pokedex_cards"
    ADD CONSTRAINT "user_pokedex_cards_user_id_card_id_set_id_key" UNIQUE ("user_id", "card_id", "set_id");


--
-- Name: wanted_cards wanted_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wanted_cards"
    ADD CONSTRAINT "wanted_cards_pkey" PRIMARY KEY ("user_id", "card_id", "set_id");


--
-- Name: binder_card_showcases_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "binder_card_showcases_user_idx" ON "public"."binder_card_showcases" USING "btree" ("user_id");


--
-- Name: binders_user_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "binders_user_language_idx" ON "public"."binders" USING "btree" ("user_id", "language");


--
-- Name: card_clip_embeddings_model_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "card_clip_embeddings_model_idx" ON "public"."card_clip_embeddings" USING "btree" ("model");


--
-- Name: community_news_published_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "community_news_published_idx" ON "public"."community_news" USING "btree" ("is_published", "sort_order", "published_at");


--
-- Name: community_news_source_url_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "community_news_source_url_unique" ON "public"."community_news" USING "btree" ("source_url") WHERE ("source_url" IS NOT NULL);


--
-- Name: idx_binder_cards_binder_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_binder_cards_binder_id" ON "public"."binder_cards" USING "btree" ("binder_id");


--
-- Name: idx_binder_cards_binder_slot_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_binder_cards_binder_slot_order" ON "public"."binder_cards" USING "btree" ("binder_id", "slot_order");


--
-- Name: idx_binders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_binders_user_id" ON "public"."binders" USING "btree" ("user_id");


--
-- Name: idx_card_fingerprints_card_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_fingerprints_card_id" ON "public"."card_fingerprints" USING "btree" ("card_id");


--
-- Name: idx_card_images_card_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_images_card_status" ON "public"."card_images" USING "btree" ("card_id", "resolution_status");


--
-- Name: idx_card_prices_card_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_prices_card_latest" ON "public"."card_prices" USING "btree" ("entity_id", "retrieved_at" DESC);


--
-- Name: idx_card_printings_language_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_printings_language_number" ON "public"."card_printings" USING "btree" ("language", "collector_number");


--
-- Name: idx_card_printings_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_card_printings_set" ON "public"."card_printings" USING "btree" ("set_id");


--
-- Name: idx_cards_language_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_language_name" ON "public"."tcg_cards" USING "btree" ("language", "canonical_name");


--
-- Name: idx_cards_local_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_local_name" ON "public"."tcg_cards" USING "gin" ("to_tsvector"('"simple"'::"regconfig", ((((COALESCE("local_name", ''::"text") || ' '::"text") || COALESCE("english_display_name", ''::"text")) || ' '::"text") || COALESCE("collector_number", ''::"text"))));


--
-- Name: idx_cards_set_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_cards_set_number" ON "public"."tcg_cards" USING "btree" ("set_id", "collector_number");


--
-- Name: idx_price_checks_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_price_checks_status" ON "public"."card_price_checks" USING "btree" ("pricing_status", "next_check_at");


--
-- Name: idx_prices_entity_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_prices_entity_latest" ON "public"."market_prices" USING "btree" ("entity_type", "entity_id", "retrieved_at" DESC);


--
-- Name: idx_products_search_text; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_products_search_text" ON "public"."sealed_products" USING "gin" ("to_tsvector"('"simple"'::"regconfig", "search_text"));


--
-- Name: idx_products_set_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_products_set_type" ON "public"."sealed_products" USING "btree" ("set_id", "product_type");


--
-- Name: idx_provider_card_record; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_provider_card_record" ON "public"."provider_card_records" USING "btree" ("provider", "provider_record_id");


--
-- Name: idx_provider_records_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_provider_records_identity" ON "public"."provider_records" USING "btree" ("provider", "provider_record_type", "provider_record_id", "language");


--
-- Name: idx_provider_set_mapping; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "idx_provider_set_mapping" ON "public"."provider_mappings" USING "btree" ("provider", "provider_record_type", "provider_record_id", "language") WHERE (("provider_record_type" = 'set'::"text") AND ("provider_record_id" IS NOT NULL));


--
-- Name: idx_sets_region_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sets_region_language" ON "public"."tcg_sets" USING "btree" ("region", "language");


--
-- Name: idx_sets_release_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sets_release_date" ON "public"."tcg_sets" USING "btree" ("release_date" DESC);


--
-- Name: idx_sync_errors_run; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sync_errors_run" ON "public"."sync_errors" USING "btree" ("sync_run_id", "created_at" DESC);


--
-- Name: idx_sync_runs_provider_latest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_sync_runs_provider_latest" ON "public"."sync_runs" USING "btree" ("provider", "language", "started_at" DESC);


--
-- Name: idx_tcg_cards_language_set; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tcg_cards_language_set" ON "public"."tcg_cards" USING "btree" ("language", "set_id");


--
-- Name: idx_tcg_cards_provider_language; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_tcg_cards_provider_language" ON "public"."tcg_cards" USING "btree" ("provider", "language", "provider_card_id");


--
-- Name: local_featured_events_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_featured_events_location_idx" ON "public"."local_featured_events" USING "btree" ("latitude", "longitude");


--
-- Name: local_featured_events_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_featured_events_starts_at_idx" ON "public"."local_featured_events" USING "btree" ("starts_at");


--
-- Name: local_meetups_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_meetups_location_idx" ON "public"."local_meetups" USING "btree" ("latitude", "longitude");


--
-- Name: local_meetups_starts_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_meetups_starts_at_idx" ON "public"."local_meetups" USING "btree" ("starts_at");


--
-- Name: local_meetups_town_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_meetups_town_idx" ON "public"."local_meetups" USING "btree" ("town");


--
-- Name: local_stores_location_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_stores_location_idx" ON "public"."local_stores" USING "btree" ("latitude", "longitude");


--
-- Name: local_stores_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "local_stores_search_idx" ON "public"."local_stores" USING "gin" ("to_tsvector"('"english"'::"regconfig", ((((COALESCE("name", ''::"text") || ' '::"text") || COALESCE("town", ''::"text")) || ' '::"text") || COALESCE("postcode", ''::"text"))));


--
-- Name: market_price_snapshots_card_day_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "market_price_snapshots_card_day_unique" ON "public"."market_price_snapshots" USING "btree" ("user_id", "card_id", "set_id", "snapshot_at");


--
-- Name: market_price_snapshots_card_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_card_lookup" ON "public"."market_price_snapshots" USING "btree" ("card_id", "set_id", "snapshot_at" DESC);


--
-- Name: market_price_snapshots_card_set_date_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "market_price_snapshots_card_set_date_unique" ON "public"."market_price_snapshots" USING "btree" ("card_id", "set_id", "date_trunc"('day'::"text", ("snapshot_at" AT TIME ZONE 'UTC'::"text")));


--
-- Name: market_price_snapshots_card_set_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_card_set_language_idx" ON "public"."market_price_snapshots" USING "btree" ("card_id", "set_id", "language");


--
-- Name: INDEX "market_price_snapshots_card_set_language_idx"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."market_price_snapshots_card_set_language_idx" IS 'Supports card/set/language price-history existence checks.';


--
-- Name: market_price_snapshots_language_card_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_language_card_idx" ON "public"."market_price_snapshots" USING "btree" ("language", "card_id", "snapshot_at" DESC);


--
-- Name: market_price_snapshots_tcgdex_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_tcgdex_idx" ON "public"."market_price_snapshots" USING "btree" ("tcgdex_card_id", "snapshot_at" DESC) WHERE ("tcgdex_card_id" IS NOT NULL);


--
-- Name: market_price_snapshots_v2_identity_latest_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_v2_identity_latest_idx" ON "public"."market_price_snapshots" USING "btree" ("card_id", "canonical_identity_key", "methodology_version", "calculated_at" DESC);


--
-- Name: market_price_snapshots_v2_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_price_snapshots_v2_stale_idx" ON "public"."market_price_snapshots" USING "btree" ("is_stale", "stale_after", "calculated_at" DESC) WHERE ("methodology_version" = 'pricing-v2.0.0'::"text");


--
-- Name: market_product_price_snapshots_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_product_price_snapshots_product_idx" ON "public"."market_product_price_snapshots" USING "btree" ("product_id", "snapshot_at" DESC);


--
-- Name: market_products_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_products_language_idx" ON "public"."market_products" USING "btree" ("language", "region");


--
-- Name: market_products_search_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_products_search_idx" ON "public"."market_products" USING "gin" ("to_tsvector"('"simple"'::"regconfig", "search_text"));


--
-- Name: market_products_source_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_products_source_provider_idx" ON "public"."market_products" USING "btree" ("source_provider", "source_id");


--
-- Name: market_products_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "market_products_type_idx" ON "public"."market_products" USING "btree" ("product_type");


--
-- Name: market_watchlist_user_card_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "market_watchlist_user_card_unique" ON "public"."market_watchlist" USING "btree" ("user_id", "card_id", "set_id");


--
-- Name: marketplace_unique_active_card_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "marketplace_unique_active_card_per_user" ON "public"."marketplace_listings" USING "btree" ("user_id", "card_id") WHERE ("status" = 'active'::"text");


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_user_unread_idx" ON "public"."notifications" USING "btree" ("user_id", "read");


--
-- Name: INDEX "notifications_user_unread_idx"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."notifications_user_unread_idx" IS 'Supports fast unread notification badge counts.';


--
-- Name: pokemon_cards_external_ids_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pokemon_cards_external_ids_gin_idx" ON "public"."pokemon_cards" USING "gin" ("external_ids");


--
-- Name: pokemon_cards_language_set_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pokemon_cards_language_set_idx" ON "public"."pokemon_cards" USING "btree" ("language", "set_id");


--
-- Name: pokemon_cards_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pokemon_cards_name_idx" ON "public"."pokemon_cards" USING "gin" ("to_tsvector"('"english"'::"regconfig", "name"));


--
-- Name: pokemon_cards_set_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pokemon_cards_set_id_idx" ON "public"."pokemon_cards" USING "btree" ("set_id");


--
-- Name: pokemon_sets_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pokemon_sets_language_idx" ON "public"."pokemon_sets" USING "btree" ("language");


--
-- Name: poketrace_api_cache_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poketrace_api_cache_expires_at_idx" ON "public"."poketrace_api_cache" USING "btree" ("expires_at");


--
-- Name: price_observations_v2_card_language_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "price_observations_v2_card_language_idx" ON "public"."price_observations" USING "btree" ("card_id", "language", "canonical_identity_key", "fetched_at" DESC);


--
-- Name: price_observations_v2_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "price_observations_v2_hash_idx" ON "public"."price_observations" USING "btree" ("observation_hash");


--
-- Name: price_observations_v2_identity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "price_observations_v2_identity_idx" ON "public"."price_observations" USING "btree" ("canonical_identity_key", "source_type", "sold_at" DESC, "listed_at" DESC, "fetched_at" DESC);


--
-- Name: pricing_review_queue_open_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pricing_review_queue_open_idx" ON "public"."pricing_review_queue" USING "btree" ("status", "priority" DESC, "created_at") WHERE ("status" = ANY (ARRAY['open'::"text", 'in_review'::"text"]));


--
-- Name: seller_inventory_items_user_card_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seller_inventory_items_user_card_idx" ON "public"."seller_inventory_items" USING "btree" ("user_id", "card_id");


--
-- Name: seller_inventory_items_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seller_inventory_items_user_idx" ON "public"."seller_inventory_items" USING "btree" ("user_id");


--
-- Name: seller_sale_transaction_items_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seller_sale_transaction_items_user_idx" ON "public"."seller_sale_transaction_items" USING "btree" ("user_id");


--
-- Name: seller_sale_transactions_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seller_sale_transactions_user_created_idx" ON "public"."seller_sale_transactions" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: seller_sale_transactions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "seller_sale_transactions_user_idx" ON "public"."seller_sale_transactions" USING "btree" ("user_id");


--
-- Name: trade_listings_owner_cardkey_live_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "trade_listings_owner_cardkey_live_uniq" ON "public"."trade_listings" USING "btree" ("owner_user_id", "card_key") WHERE ("status" = ANY (ARRAY['live'::"text", 'reserved'::"text"]));


--
-- Name: trade_listings_owner_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_listings_owner_idx" ON "public"."trade_listings" USING "btree" ("owner_user_id");


--
-- Name: trade_listings_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_listings_status_idx" ON "public"."trade_listings" USING "btree" ("status");


--
-- Name: trade_offers_receiver_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_offers_receiver_status_idx" ON "public"."trade_offers" USING "btree" ("receiver_id", "status");


--
-- Name: INDEX "trade_offers_receiver_status_idx"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."trade_offers_receiver_status_idx" IS 'Supports profile/home trade status summaries for received trades.';


--
-- Name: trade_offers_sender_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_offers_sender_status_idx" ON "public"."trade_offers" USING "btree" ("sender_id", "status");


--
-- Name: INDEX "trade_offers_sender_status_idx"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."trade_offers_sender_status_idx" IS 'Supports profile/home trade status summaries for sent trades.';


--
-- Name: trade_reviews_reviewed_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_reviews_reviewed_user_id_idx" ON "public"."trade_reviews" USING "btree" ("reviewed_user_id");


--
-- Name: trade_reviews_reviewer_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_reviews_reviewer_id_idx" ON "public"."trade_reviews" USING "btree" ("reviewer_id");


--
-- Name: trade_reviews_trade_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "trade_reviews_trade_id_idx" ON "public"."trade_reviews" USING "btree" ("trade_id");


--
-- Name: user_achievement_events_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_achievement_events_user_type_idx" ON "public"."user_achievement_events" USING "btree" ("user_id", "event_type", "created_at" DESC);


--
-- Name: user_achievements_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_achievements_user_idx" ON "public"."user_achievements" USING "btree" ("user_id", "unlocked_at" DESC);


--
-- Name: user_card_flags_user_listing_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_card_flags_user_listing_status_idx" ON "public"."user_card_flags" USING "btree" ("user_id", "listing_status");


--
-- Name: INDEX "user_card_flags_user_listing_status_idx"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX "public"."user_card_flags_user_listing_status_idx" IS 'Supports profile listing totals and active listing filtering.';


--
-- Name: user_card_variants_user_card_set_variant_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_card_variants_user_card_set_variant_uidx" ON "public"."user_card_variants" USING "btree" ("user_id", "card_id", "set_id", "variant");


--
-- Name: user_coin_ledger_achievement_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_coin_ledger_achievement_unique" ON "public"."user_coin_ledger" USING "btree" ("user_id", "achievement_id") WHERE (("achievement_id" IS NOT NULL) AND ("reason" = 'achievement_unlock'::"text"));


--
-- Name: user_coin_ledger_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_coin_ledger_user_created_idx" ON "public"."user_coin_ledger" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: user_cosmetics_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_cosmetics_user_idx" ON "public"."user_cosmetics" USING "btree" ("user_id", "unlocked_at" DESC);


--
-- Name: user_pokedex_cards_card_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_pokedex_cards_card_id_idx" ON "public"."user_pokedex_cards" USING "btree" ("card_id");


--
-- Name: user_pokedex_cards_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_pokedex_cards_user_id_idx" ON "public"."user_pokedex_cards" USING "btree" ("user_id");


--
-- Name: japanese_catalogue_health _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW "public"."japanese_catalogue_health" AS
 SELECT "s"."id" AS "set_id",
    "s"."source_provider",
    "s"."source_id",
    "s"."local_name",
    "s"."english_display_name",
    "s"."set_code",
    "s"."release_date",
    "s"."printed_total",
    "s"."actual_total",
    ("count"("c"."id"))::integer AS "stored_total",
    ("count"("c"."id") FILTER (WHERE ("c"."data_completeness" = ANY (ARRAY['verified'::"text", 'high'::"text", 'medium'::"text"]))))::integer AS "cards_with_metadata",
    ("count"("c"."id") FILTER (WHERE ("c"."image_small_url" IS NOT NULL)))::integer AS "cards_with_small_image",
    ("count"("c"."id") FILTER (WHERE ("c"."image_large_url" IS NOT NULL)))::integer AS "cards_with_large_image",
    ("count"("c"."id") FILTER (WHERE (EXISTS ( SELECT 1
           FROM "public"."market_prices" "p"
          WHERE (("p"."entity_type" = ANY (ARRAY['card'::"text", 'card_printing'::"text"])) AND ("p"."entity_id" = ANY (ARRAY["c"."id", COALESCE("c"."source_id", "c"."id")])) AND ("p"."region" = "s"."region") AND ("p"."language" = "s"."language"))))))::integer AS "cards_with_price",
    (GREATEST((COALESCE("s"."actual_total", 0) - "count"("c"."id") FILTER (WHERE (EXISTS ( SELECT 1
           FROM "public"."market_prices" "p"
          WHERE (("p"."entity_type" = ANY (ARRAY['card'::"text", 'card_printing'::"text"])) AND ("p"."entity_id" = ANY (ARRAY["c"."id", COALESCE("c"."source_id", "c"."id")])) AND ("p"."region" = "s"."region") AND ("p"."language" = "s"."language")))))), (0)::bigint))::integer AS "cards_missing_price",
    ("count"("c"."id") FILTER (WHERE (("c"."image_small_url" IS NULL) AND ("c"."image_large_url" IS NULL))))::integer AS "cards_missing_image",
    ("count"("c"."id") FILTER (WHERE ("c"."data_completeness" = 'unavailable'::"text")))::integer AS "cards_unmatched",
    ("count"(DISTINCT "sp"."id"))::integer AS "sealed_products_linked",
    "max"("c"."last_synced_at") AS "last_successful_sync",
        CASE
            WHEN ("s"."data_completeness" = 'sync_failed'::"text") THEN 'Sync failed'::"text"
            WHEN ("count"("c"."id") < COALESCE("s"."actual_total", "s"."printed_total", 0)) THEN 'Card metadata incomplete'::"text"
            WHEN ("count"("c"."id") FILTER (WHERE (("c"."image_small_url" IS NULL) AND ("c"."image_large_url" IS NULL))) > 0) THEN 'Images incomplete'::"text"
            WHEN ("count"(DISTINCT "sp"."id") = 0) THEN 'Products incomplete'::"text"
            WHEN ("count"("c"."id") FILTER (WHERE (EXISTS ( SELECT 1
               FROM "public"."market_prices" "p"
              WHERE (("p"."entity_type" = ANY (ARRAY['card'::"text", 'card_printing'::"text"])) AND ("p"."entity_id" = ANY (ARRAY["c"."id", COALESCE("c"."source_id", "c"."id")])) AND ("p"."region" = "s"."region") AND ("p"."language" = "s"."language"))))) < "count"("c"."id")) THEN 'Pricing incomplete'::"text"
            WHEN (("s"."data_completeness" = ANY (ARRAY['verified'::"text", 'high'::"text"])) AND ("s"."image_completeness" = ANY (ARRAY['verified'::"text", 'high'::"text"]))) THEN 'Complete'::"text"
            ELSE 'Needs review'::"text"
        END AS "current_status"
   FROM (("public"."tcg_sets" "s"
     LEFT JOIN "public"."tcg_cards" "c" ON (("c"."set_id" = "s"."id")))
     LEFT JOIN "public"."sealed_products" "sp" ON (("sp"."set_id" = "s"."id")))
  WHERE (("s"."region" = 'JP'::"text") AND ("s"."language" = 'ja'::"text"))
  GROUP BY "s"."id";


--
-- Name: binder_cards binder_cards_recalculate_values; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "binder_cards_recalculate_values" AFTER INSERT OR DELETE OR UPDATE ON "public"."binder_cards" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_recalculate_binder_values"();


--
-- Name: trade_listings set_trade_listings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "set_trade_listings_updated_at" BEFORE UPDATE ON "public"."trade_listings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();


--
-- Name: local_featured_events touch_local_featured_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_local_featured_events_updated_at" BEFORE UPDATE ON "public"."local_featured_events" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: local_meetups touch_local_meetups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_local_meetups_updated_at" BEFORE UPDATE ON "public"."local_meetups" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: local_stores touch_local_stores_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "touch_local_stores_updated_at" BEFORE UPDATE ON "public"."local_stores" FOR EACH ROW EXECUTE FUNCTION "public"."touch_updated_at"();


--
-- Name: wanted_cards wanted_cards_limit_guard; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "wanted_cards_limit_guard" BEFORE INSERT ON "public"."wanted_cards" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_wanted_card_limit"();


--
-- Name: activity_feed activity_feed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_feed"
    ADD CONSTRAINT "activity_feed_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: activity_reactions activity_reactions_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_reactions"
    ADD CONSTRAINT "activity_reactions_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_feed"("id") ON DELETE CASCADE;


--
-- Name: activity_reactions activity_reactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."activity_reactions"
    ADD CONSTRAINT "activity_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: binder_card_showcases binder_card_showcases_binder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_card_showcases"
    ADD CONSTRAINT "binder_card_showcases_binder_id_fkey" FOREIGN KEY ("binder_id") REFERENCES "public"."binders"("id") ON DELETE CASCADE;


--
-- Name: binder_card_showcases binder_card_showcases_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_card_showcases"
    ADD CONSTRAINT "binder_card_showcases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: binder_cards binder_cards_binder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binder_cards"
    ADD CONSTRAINT "binder_cards_binder_id_fkey" FOREIGN KEY ("binder_id") REFERENCES "public"."binders"("id") ON DELETE CASCADE;


--
-- Name: binders binders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."binders"
    ADD CONSTRAINT "binders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: card_clip_embeddings card_clip_embeddings_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_clip_embeddings"
    ADD CONSTRAINT "card_clip_embeddings_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."pokemon_cards"("id") ON DELETE CASCADE;


--
-- Name: card_printings card_printings_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_printings"
    ADD CONSTRAINT "card_printings_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."tcg_cards"("id") ON DELETE CASCADE;


--
-- Name: card_printings card_printings_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_printings"
    ADD CONSTRAINT "card_printings_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."canonical_card_concepts"("id") ON DELETE SET NULL;


--
-- Name: card_printings card_printings_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_printings"
    ADD CONSTRAINT "card_printings_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."tcg_sets"("id") ON DELETE CASCADE;


--
-- Name: card_variants card_variants_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_variants"
    ADD CONSTRAINT "card_variants_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."tcg_cards"("id") ON DELETE CASCADE;


--
-- Name: card_variants card_variants_printing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."card_variants"
    ADD CONSTRAINT "card_variants_printing_id_fkey" FOREIGN KEY ("printing_id") REFERENCES "public"."card_printings"("id") ON DELETE CASCADE;


--
-- Name: catalogue_sync_errors catalogue_sync_errors_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."catalogue_sync_errors"
    ADD CONSTRAINT "catalogue_sync_errors_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."catalogue_sync_runs"("id") ON DELETE CASCADE;


--
-- Name: feed_events feed_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."feed_events"
    ADD CONSTRAINT "feed_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: follows follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: follows follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."follows"
    ADD CONSTRAINT "follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: friendships friendships_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_featured_events local_featured_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_featured_events"
    ADD CONSTRAINT "local_featured_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: local_meetup_attendees local_meetup_attendees_meetup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_meetup_attendees"
    ADD CONSTRAINT "local_meetup_attendees_meetup_id_fkey" FOREIGN KEY ("meetup_id") REFERENCES "public"."local_meetups"("id") ON DELETE CASCADE;


--
-- Name: local_meetup_attendees local_meetup_attendees_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_meetup_attendees"
    ADD CONSTRAINT "local_meetup_attendees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_meetups local_meetups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_meetups"
    ADD CONSTRAINT "local_meetups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: local_stores local_stores_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."local_stores"
    ADD CONSTRAINT "local_stores_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: market_product_price_snapshots market_product_price_snapshots_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_product_price_snapshots"
    ADD CONSTRAINT "market_product_price_snapshots_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: market_product_price_snapshots market_product_price_snapshots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_product_price_snapshots"
    ADD CONSTRAINT "market_product_price_snapshots_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."market_products"("id") ON DELETE CASCADE;


--
-- Name: market_products market_products_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_products"
    ADD CONSTRAINT "market_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: market_watchlist market_watchlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."market_watchlist"
    ADD CONSTRAINT "market_watchlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: marketplace_listings marketplace_listings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."marketplace_listings"
    ADD CONSTRAINT "marketplace_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: pokemap_saved_shops pokemap_saved_shops_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemap_saved_shops"
    ADD CONSTRAINT "pokemap_saved_shops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: pokemon_cards pokemon_cards_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."pokemon_cards"
    ADD CONSTRAINT "pokemon_cards_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."pokemon_sets"("id") ON DELETE CASCADE;


--
-- Name: price_alerts price_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."price_alerts"
    ADD CONSTRAINT "price_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: price_history price_history_market_price_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."price_history"
    ADD CONSTRAINT "price_history_market_price_id_fkey" FOREIGN KEY ("market_price_id") REFERENCES "public"."market_prices"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: scan_training_data scan_training_data_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."scan_training_data"
    ADD CONSTRAINT "scan_training_data_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "public"."pokemon_cards"("id");


--
-- Name: sealed_product_variants sealed_product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sealed_product_variants"
    ADD CONSTRAINT "sealed_product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."sealed_products"("id") ON DELETE CASCADE;


--
-- Name: sealed_products sealed_products_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sealed_products"
    ADD CONSTRAINT "sealed_products_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."tcg_sets"("id") ON DELETE SET NULL;


--
-- Name: seller_inventory_items seller_inventory_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_inventory_items"
    ADD CONSTRAINT "seller_inventory_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: seller_sale_transaction_items seller_sale_transaction_items_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_sale_transaction_items"
    ADD CONSTRAINT "seller_sale_transaction_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "public"."seller_sale_transactions"("id") ON DELETE CASCADE;


--
-- Name: seller_sale_transaction_items seller_sale_transaction_items_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_sale_transaction_items"
    ADD CONSTRAINT "seller_sale_transaction_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: seller_sale_transactions seller_sale_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."seller_sale_transactions"
    ADD CONSTRAINT "seller_sale_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: social_posts social_posts_binder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_binder_id_fkey" FOREIGN KEY ("binder_id") REFERENCES "public"."binders"("id") ON DELETE SET NULL;


--
-- Name: social_posts social_posts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."social_posts"
    ADD CONSTRAINT "social_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sync_errors sync_errors_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."sync_errors"
    ADD CONSTRAINT "sync_errors_sync_run_id_fkey" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE CASCADE;


--
-- Name: tcg_cards tcg_cards_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_cards"
    ADD CONSTRAINT "tcg_cards_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "public"."canonical_card_concepts"("id") ON DELETE SET NULL;


--
-- Name: tcg_cards tcg_cards_set_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_cards"
    ADD CONSTRAINT "tcg_cards_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "public"."tcg_sets"("id") ON DELETE CASCADE;


--
-- Name: tcg_sets tcg_sets_series_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tcg_sets"
    ADD CONSTRAINT "tcg_sets_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."tcg_series"("id") ON DELETE SET NULL;


--
-- Name: trade_cash_terms trade_cash_terms_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_cash_terms"
    ADD CONSTRAINT "trade_cash_terms_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."trade_offers"("id") ON DELETE CASCADE;


--
-- Name: trade_cash_terms trade_cash_terms_payer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_cash_terms"
    ADD CONSTRAINT "trade_cash_terms_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_cash_terms trade_cash_terms_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_cash_terms"
    ADD CONSTRAINT "trade_cash_terms_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_listings trade_listings_owner_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_listings"
    ADD CONSTRAINT "trade_listings_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_offer_cards trade_offer_cards_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_cards"
    ADD CONSTRAINT "trade_offer_cards_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."trade_offers"("id") ON DELETE CASCADE;


--
-- Name: trade_offer_cards trade_offer_cards_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_cards"
    ADD CONSTRAINT "trade_offer_cards_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_offer_events trade_offer_events_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_events"
    ADD CONSTRAINT "trade_offer_events_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."trade_offers"("id") ON DELETE CASCADE;


--
-- Name: trade_offer_events trade_offer_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offer_events"
    ADD CONSTRAINT "trade_offer_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_offers trade_offers_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offers"
    ADD CONSTRAINT "trade_offers_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."user_card_flags"("id") ON DELETE SET NULL;


--
-- Name: trade_offers trade_offers_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offers"
    ADD CONSTRAINT "trade_offers_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_offers trade_offers_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_offers"
    ADD CONSTRAINT "trade_offers_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_reviews trade_reviews_reviewed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_reviews"
    ADD CONSTRAINT "trade_reviews_reviewed_user_id_fkey" FOREIGN KEY ("reviewed_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trade_reviews trade_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trade_reviews"
    ADD CONSTRAINT "trade_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trader_ratings trader_ratings_reviewed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trader_ratings"
    ADD CONSTRAINT "trader_ratings_reviewed_user_id_fkey" FOREIGN KEY ("reviewed_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trader_ratings trader_ratings_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trader_ratings"
    ADD CONSTRAINT "trader_ratings_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: trader_ratings trader_ratings_trade_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trader_ratings"
    ADD CONSTRAINT "trader_ratings_trade_offer_id_fkey" FOREIGN KEY ("trade_offer_id") REFERENCES "public"."trade_offers"("id") ON DELETE CASCADE;


--
-- Name: trades trades_buyer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "auth"."users"("id");


--
-- Name: trades trades_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."trade_listings"("id") ON DELETE CASCADE;


--
-- Name: trades trades_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "public"."trade_offers"("id") ON DELETE CASCADE;


--
-- Name: trades trades_seller_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."trades"
    ADD CONSTRAINT "trades_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "auth"."users"("id");


--
-- Name: user_achievement_events user_achievement_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievement_events"
    ADD CONSTRAINT "user_achievement_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_achievements user_achievements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_achievements"
    ADD CONSTRAINT "user_achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_card_flags user_card_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_flags"
    ADD CONSTRAINT "user_card_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_card_variants user_card_variants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_card_variants"
    ADD CONSTRAINT "user_card_variants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: user_coin_ledger user_coin_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_coin_ledger"
    ADD CONSTRAINT "user_coin_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_cosmetics user_cosmetics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_cosmetics"
    ADD CONSTRAINT "user_cosmetics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_follows user_follows_follower_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_follows user_follows_following_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_follows"
    ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_milestones user_milestones_milestone_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestone_definitions"("id") ON DELETE CASCADE;


--
-- Name: user_milestones user_milestones_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_milestones"
    ADD CONSTRAINT "user_milestones_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_pokedex_cards user_pokedex_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_pokedex_cards"
    ADD CONSTRAINT "user_pokedex_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: wanted_cards wanted_cards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."wanted_cards"
    ADD CONSTRAINT "wanted_cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: binder_cards Admins can do anything to binder cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to binder cards" ON "public"."binder_cards" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: binders Admins can do anything to binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to binders" ON "public"."binders" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: user_card_flags Admins can do anything to listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to listings" ON "public"."user_card_flags" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: trade_offer_cards Admins can do anything to offer cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to offer cards" ON "public"."trade_offer_cards" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: trade_offer_events Admins can do anything to offer events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to offer events" ON "public"."trade_offer_events" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: social_posts Admins can do anything to posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to posts" ON "public"."social_posts" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: profiles Admins can do anything to profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to profiles" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: trade_offers Admins can do anything to trade offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can do anything to trade offers" ON "public"."trade_offers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: community_news Admins can manage community news; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage community news" ON "public"."community_news" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: local_featured_events Admins can manage local featured events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage local featured events" ON "public"."local_featured_events" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: local_meetups Admins can manage local meetups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage local meetups" ON "public"."local_meetups" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: local_stores Admins can manage local stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage local stores" ON "public"."local_stores" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: market_price_snapshots Allow authenticated users to read market snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated users to read market snapshots" ON "public"."market_price_snapshots" FOR SELECT TO "authenticated" USING (true);


--
-- Name: user_card_flags Anyone can read active trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read active trade listings" ON "public"."user_card_flags" FOR SELECT USING ((("flag_type" = 'trade'::"text") AND ("listing_status" = 'active'::"text")));


--
-- Name: activity_feed Anyone can read activity feed; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read activity feed" ON "public"."activity_feed" FOR SELECT USING (true);


--
-- Name: activity_reactions Anyone can read activity reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read activity reactions" ON "public"."activity_reactions" FOR SELECT USING (true);


--
-- Name: card_previews Anyone can read card previews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read card previews" ON "public"."card_previews" FOR SELECT USING (true);


--
-- Name: feed_events Anyone can read feed events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read feed events" ON "public"."feed_events" FOR SELECT USING (true);


--
-- Name: user_follows Anyone can read follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read follows" ON "public"."user_follows" FOR SELECT USING (true);


--
-- Name: pokemon_cards Anyone can read pokemon cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read pokemon cards" ON "public"."pokemon_cards" FOR SELECT USING (true);


--
-- Name: pokemon_sets Anyone can read pokemon sets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read pokemon sets" ON "public"."pokemon_sets" FOR SELECT USING (true);


--
-- Name: social_posts Anyone can read social posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read social posts" ON "public"."social_posts" FOR SELECT USING (true);


--
-- Name: marketplace_listings Anyone can view active marketplace listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view active marketplace listings" ON "public"."marketplace_listings" FOR SELECT USING (("status" = 'active'::"text"));


--
-- Name: trade_listings Anyone can view live public trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view live public trade listings" ON "public"."trade_listings" FOR SELECT USING ((("is_public" = true) AND ("status" = 'live'::"text")));


--
-- Name: milestone_definitions Anyone can view milestone definitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view milestone definitions" ON "public"."milestone_definitions" FOR SELECT USING (true);


--
-- Name: binders Anyone can view public binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view public binders" ON "public"."binders" FOR SELECT USING (("is_public" = true));


--
-- Name: trader_ratings Anyone can view trader ratings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view trader ratings" ON "public"."trader_ratings" FOR SELECT USING (true);


--
-- Name: trade_reviews Anyone signed in can view trade reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone signed in can view trade reviews" ON "public"."trade_reviews" FOR SELECT TO "authenticated" USING (true);


--
-- Name: market_product_price_snapshots Authenticated users can add market product prices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can add market product prices" ON "public"."market_product_price_snapshots" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: market_products Authenticated users can add market products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can add market products" ON "public"."market_products" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: price_observations Authenticated users can read price observations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can read price observations" ON "public"."price_observations" FOR SELECT TO "authenticated" USING (true);


--
-- Name: card_previews Authenticated users can update card previews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update card previews" ON "public"."card_previews" FOR UPDATE USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: market_products Authenticated users can update market products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can update market products" ON "public"."market_products" FOR UPDATE USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: card_previews Authenticated users can upsert card previews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated users can upsert card previews" ON "public"."card_previews" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: card_printings Card printings are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Card printings are readable" ON "public"."card_printings" FOR SELECT USING (true);


--
-- Name: card_variants Card variants are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Card variants are readable" ON "public"."card_variants" FOR SELECT USING (true);


--
-- Name: canonical_card_concepts Catalogue concepts are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Catalogue concepts are readable" ON "public"."canonical_card_concepts" FOR SELECT USING (true);


--
-- Name: market_price_snapshots Market price snapshots are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Market price snapshots are readable" ON "public"."market_price_snapshots" FOR SELECT USING ((("user_id" IS NULL) OR ("auth"."uid"() = "user_id")));


--
-- Name: market_prices Market prices are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Market prices are readable" ON "public"."market_prices" FOR SELECT USING (true);


--
-- Name: market_product_price_snapshots Market product prices are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Market product prices are public" ON "public"."market_product_price_snapshots" FOR SELECT USING (true);


--
-- Name: market_products Market products are public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Market products are public" ON "public"."market_products" FOR SELECT USING (true);


--
-- Name: price_history Price history is readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Price history is readable" ON "public"."price_history" FOR SELECT USING (true);


--
-- Name: pricing_review_queue Pricing review queue requires service role; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pricing review queue requires service role" ON "public"."pricing_review_queue" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));


--
-- Name: pricing_sources Pricing sources are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Pricing sources are readable" ON "public"."pricing_sources" FOR SELECT TO "authenticated" USING (true);


--
-- Name: provider_mappings Provider mappings are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Provider mappings are readable" ON "public"."provider_mappings" FOR SELECT USING (true);


--
-- Name: binder_card_showcases Public can view binder showcases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view binder showcases" ON "public"."binder_card_showcases" FOR SELECT USING (true);


--
-- Name: binder_cards Public can view public binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can view public binders" ON "public"."binder_cards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."is_public" = true)))));


--
-- Name: profiles Public profiles are viewable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public profiles are viewable" ON "public"."profiles" FOR SELECT USING (true);


--
-- Name: community_news Published community news is readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Published community news is readable" ON "public"."community_news" FOR SELECT USING ((("is_published" = true) OR "public"."is_admin"()));


--
-- Name: sealed_product_variants Sealed product variants are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sealed product variants are readable" ON "public"."sealed_product_variants" FOR SELECT USING (true);


--
-- Name: sealed_products Sealed products are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sealed products are readable" ON "public"."sealed_products" FOR SELECT USING (true);


--
-- Name: seller_inventory_items Seller inventory is private; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seller inventory is private" ON "public"."seller_inventory_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: seller_sale_transaction_items Seller sale transaction items are private; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seller sale transaction items are private" ON "public"."seller_sale_transaction_items" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: seller_sale_transactions Seller sale transactions are private; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Seller sale transactions are private" ON "public"."seller_sale_transactions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sync_errors Sync errors require authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sync errors require authenticated read" ON "public"."sync_errors" FOR SELECT TO "authenticated" USING (true);


--
-- Name: sync_runs Sync runs require authenticated read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sync runs require authenticated read" ON "public"."sync_runs" FOR SELECT TO "authenticated" USING (true);


--
-- Name: tcg_cards TCG cards are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TCG cards are readable" ON "public"."tcg_cards" FOR SELECT USING (true);


--
-- Name: tcg_series TCG series are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TCG series are readable" ON "public"."tcg_series" FOR SELECT USING (true);


--
-- Name: tcg_sets TCG sets are readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "TCG sets are readable" ON "public"."tcg_sets" FOR SELECT USING (true);


--
-- Name: trade_offer_events Trade participants can add offer events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade participants can add offer events" ON "public"."trade_offer_events" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."trade_offers" "o"
  WHERE (("o"."id" = "trade_offer_events"."offer_id") AND (("o"."sender_id" = "auth"."uid"()) OR ("o"."receiver_id" = "auth"."uid"())))))));


--
-- Name: trade_offer_events Trade participants can view offer events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade participants can view offer events" ON "public"."trade_offer_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."trade_offers" "o"
  WHERE (("o"."id" = "trade_offer_events"."offer_id") AND (("o"."sender_id" = "auth"."uid"()) OR ("o"."receiver_id" = "auth"."uid"()))))));


--
-- Name: trade_cash_terms Trade users can read cash terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade users can read cash terms" ON "public"."trade_cash_terms" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trade_offers"
  WHERE (("trade_offers"."id" = "trade_cash_terms"."offer_id") AND (("trade_offers"."sender_id" = "auth"."uid"()) OR ("trade_offers"."receiver_id" = "auth"."uid"()))))));


--
-- Name: trade_offer_cards Trade users can read offer cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade users can read offer cards" ON "public"."trade_offer_cards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."trade_offers"
  WHERE (("trade_offers"."id" = "trade_offer_cards"."offer_id") AND (("trade_offers"."sender_id" = "auth"."uid"()) OR ("trade_offers"."receiver_id" = "auth"."uid"()))))));


--
-- Name: trade_offers Trade users can read offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade users can read offers" ON "public"."trade_offers" FOR SELECT USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));


--
-- Name: trade_cash_terms Trade users can update cash terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade users can update cash terms" ON "public"."trade_cash_terms" FOR UPDATE USING ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "recipient_id"))) WITH CHECK ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "recipient_id")));


--
-- Name: trade_offers Trade users can update offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Trade users can update offers" ON "public"."trade_offers" FOR UPDATE USING ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id"))) WITH CHECK ((("auth"."uid"() = "sender_id") OR ("auth"."uid"() = "receiver_id")));


--
-- Name: trade_offer_cards Users can add own offer cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can add own offer cards" ON "public"."trade_offer_cards" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));


--
-- Name: binder_cards Users can create cards in own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create cards in own binders" ON "public"."binder_cards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: trade_cash_terms Users can create cash terms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create cash terms" ON "public"."trade_cash_terms" FOR INSERT WITH CHECK ((("auth"."uid"() = "payer_id") OR ("auth"."uid"() = "recipient_id")));


--
-- Name: trade_offers Users can create offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create offers" ON "public"."trade_offers" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));


--
-- Name: binder_cards Users can create own binder cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own binder cards" ON "public"."binder_cards" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binders Users can create own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own binders" ON "public"."binders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: market_watchlist Users can create own market watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create own market watchlist" ON "public"."market_watchlist" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: marketplace_listings Users can create their own marketplace listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own marketplace listings" ON "public"."marketplace_listings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: social_posts Users can create their own social posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own social posts" ON "public"."social_posts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: trade_reviews Users can create their own trade reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can create their own trade reviews" ON "public"."trade_reviews" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "reviewer_id") AND ("reviewer_id" <> "reviewed_user_id")));


--
-- Name: binder_cards Users can delete cards in own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete cards in own binders" ON "public"."binder_cards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binder_cards Users can delete own binder cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own binder cards" ON "public"."binder_cards" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binders Users can delete own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own binders" ON "public"."binders" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_card_flags Users can delete own card flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own card flags" ON "public"."user_card_flags" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: market_watchlist Users can delete own market watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own market watchlist" ON "public"."market_watchlist" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users can delete own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_pokedex_cards Users can delete own pokedex cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete own pokedex cards" ON "public"."user_pokedex_cards" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: feed_events Users can delete their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own events" ON "public"."feed_events" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: friendships Users can delete their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own friendships" ON "public"."friendships" FOR DELETE USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "receiver_id")));


--
-- Name: marketplace_listings Users can delete their own marketplace listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own marketplace listings" ON "public"."marketplace_listings" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: social_posts Users can delete their own social posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own social posts" ON "public"."social_posts" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: trade_listings Users can delete their own trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own trade listings" ON "public"."trade_listings" FOR DELETE TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: user_follows Users can follow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can follow" ON "public"."user_follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));


--
-- Name: follows Users can follow others; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can follow others" ON "public"."follows" FOR INSERT WITH CHECK (("auth"."uid"() = "follower_id"));


--
-- Name: trade_offer_cards Users can insert offer cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert offer cards" ON "public"."trade_offer_cards" FOR INSERT TO "authenticated" WITH CHECK (("offer_id" IN ( SELECT "trade_offers"."id"
   FROM "public"."trade_offers"
  WHERE ("trade_offers"."sender_id" = "auth"."uid"()))));


--
-- Name: user_achievement_events Users can insert own achievement events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own achievement events" ON "public"."user_achievement_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_achievements Users can insert own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own achievements" ON "public"."user_achievements" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: activity_feed Users can insert own activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own activity" ON "public"."activity_feed" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_card_flags Users can insert own card flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own card flags" ON "public"."user_card_flags" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_coin_ledger Users can insert own coin ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own coin ledger" ON "public"."user_coin_ledger" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_cosmetics Users can insert own cosmetics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own cosmetics" ON "public"."user_cosmetics" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_pokedex_cards Users can insert own pokedex cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own pokedex cards" ON "public"."user_pokedex_cards" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: trade_listings Users can insert their own trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own trade listings" ON "public"."trade_listings" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: binder_card_showcases Users can manage own binder showcases; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own binder showcases" ON "public"."binder_card_showcases" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: feed_events Users can post their own events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can post their own events" ON "public"."feed_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: trader_ratings Users can rate completed trades they were part of; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can rate completed trades they were part of" ON "public"."trader_ratings" FOR INSERT WITH CHECK ((("auth"."uid"() = "reviewer_id") AND (EXISTS ( SELECT 1
   FROM "public"."trade_offers" "t"
  WHERE (("t"."id" = "trader_ratings"."trade_offer_id") AND ("t"."status" = 'completed'::"text") AND (("auth"."uid"() = "t"."sender_id") OR ("auth"."uid"() = "t"."receiver_id")) AND (("trader_ratings"."reviewed_user_id" = "t"."sender_id") OR ("trader_ratings"."reviewed_user_id" = "t"."receiver_id")) AND ("trader_ratings"."reviewed_user_id" <> "auth"."uid"()))))));


--
-- Name: activity_reactions Users can react; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can react" ON "public"."activity_reactions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: binder_cards Users can read cards in own or public binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read cards in own or public binders" ON "public"."binder_cards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND (("binders"."user_id" = "auth"."uid"()) OR ("binders"."is_public" = true))))));


--
-- Name: user_achievement_events Users can read own achievement events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own achievement events" ON "public"."user_achievement_events" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_achievements Users can read own achievements; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own achievements" ON "public"."user_achievements" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: binder_cards Users can read own binder cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own binder cards" ON "public"."binder_cards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binders Users can read own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own binders" ON "public"."binders" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_card_flags Users can read own card flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own card flags" ON "public"."user_card_flags" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_coin_ledger Users can read own coin ledger; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own coin ledger" ON "public"."user_coin_ledger" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_cosmetics Users can read own cosmetics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own cosmetics" ON "public"."user_cosmetics" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: market_watchlist Users can read own market watchlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own market watchlist" ON "public"."market_watchlist" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users can read own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: binders Users can read own or public binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own or public binders" ON "public"."binders" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("is_public" = true)));


--
-- Name: user_pokedex_cards Users can read own pokedex cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own pokedex cards" ON "public"."user_pokedex_cards" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: activity_reactions Users can remove own reactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can remove own reactions" ON "public"."activity_reactions" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: follows Users can see all follows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can see all follows" ON "public"."follows" FOR SELECT USING (true);


--
-- Name: friendships Users can send friend requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can send friend requests" ON "public"."friendships" FOR INSERT WITH CHECK ((("auth"."uid"() = "requester_id") AND ("requester_id" <> "receiver_id")));


--
-- Name: follows Users can unfollow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unfollow" ON "public"."follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));


--
-- Name: user_follows Users can unfollow; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unfollow" ON "public"."user_follows" FOR DELETE USING (("auth"."uid"() = "follower_id"));


--
-- Name: user_milestones Users can unlock their own milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can unlock their own milestones" ON "public"."user_milestones" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: binder_cards Users can update cards in own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update cards in own binders" ON "public"."binder_cards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binder_cards Users can update own binder cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own binder cards" ON "public"."binder_cards" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."binders"
  WHERE (("binders"."id" = "binder_cards"."binder_id") AND ("binders"."user_id" = "auth"."uid"())))));


--
-- Name: binders Users can update own binders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own binders" ON "public"."binders" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_card_flags Users can update own card flags; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own card flags" ON "public"."user_card_flags" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: notifications Users can update own notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_pokedex_cards Users can update own pokedex cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own pokedex cards" ON "public"."user_pokedex_cards" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: friendships Users can update received friend requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update received friend requests" ON "public"."friendships" FOR UPDATE USING (("auth"."uid"() = "receiver_id")) WITH CHECK (("auth"."uid"() = "receiver_id"));


--
-- Name: marketplace_listings Users can update their own marketplace listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own marketplace listings" ON "public"."marketplace_listings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: social_posts Users can update their own social posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own social posts" ON "public"."social_posts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: trade_listings Users can update their own trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own trade listings" ON "public"."trade_listings" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));


--
-- Name: user_card_flags Users can view all active listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all active listings" ON "public"."user_card_flags" FOR SELECT TO "authenticated" USING ((("listing_status" = 'active'::"text") OR ("user_id" = "auth"."uid"())));


--
-- Name: trade_offer_cards Users can view offer cards for their offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view offer cards for their offers" ON "public"."trade_offer_cards" FOR SELECT TO "authenticated" USING (("offer_id" IN ( SELECT "trade_offers"."id"
   FROM "public"."trade_offers"
  WHERE (("trade_offers"."sender_id" = "auth"."uid"()) OR ("trade_offers"."receiver_id" = "auth"."uid"())))));


--
-- Name: friendships Users can view their own friendships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "requester_id") OR ("auth"."uid"() = "receiver_id")));


--
-- Name: user_milestones Users can view their own milestones; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own milestones" ON "public"."user_milestones" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: trade_listings Users can view their own trade listings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own trade listings" ON "public"."trade_listings" FOR SELECT TO "authenticated" USING (("owner_user_id" = "auth"."uid"()));


--
-- Name: price_alerts Users manage own alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own alerts" ON "public"."price_alerts" USING (("auth"."uid"() = "user_id"));


--
-- Name: user_card_variants Users manage own variants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users manage own variants" ON "public"."user_card_variants" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: activity_feed; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."activity_feed" ENABLE ROW LEVEL SECURITY;

--
-- Name: activity_reactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."activity_reactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_featured_events admins manage featured events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage featured events" ON "public"."local_featured_events" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: local_stores admins manage local stores; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admins manage local stores" ON "public"."local_stores" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());


--
-- Name: local_meetup_attendees attendees readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "attendees readable" ON "public"."local_meetup_attendees" FOR SELECT USING (true);


--
-- Name: binder_card_showcases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."binder_card_showcases" ENABLE ROW LEVEL SECURITY;

--
-- Name: binder_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."binder_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: binders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."binders" ENABLE ROW LEVEL SECURITY;

--
-- Name: canonical_card_concepts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."canonical_card_concepts" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_clip_embeddings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_clip_embeddings" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_fingerprints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_fingerprints" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_image_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_image_checks" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_images" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_previews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_previews" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_price_checks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_price_checks" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_prices" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_printings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_printings" ENABLE ROW LEVEL SECURITY;

--
-- Name: card_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."card_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogue_review_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."catalogue_review_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogue_sync_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."catalogue_sync_errors" ENABLE ROW LEVEL SECURITY;

--
-- Name: catalogue_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."catalogue_sync_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: community_news; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."community_news" ENABLE ROW LEVEL SECURITY;

--
-- Name: cron_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."cron_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: pokemap_saved_shops delete_own_saved_shops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "delete_own_saved_shops" ON "public"."pokemap_saved_shops" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: local_featured_events featured events readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "featured events readable" ON "public"."local_featured_events" FOR SELECT USING ((("is_published" = true) OR "public"."is_admin"()));


--
-- Name: feed_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."feed_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."follows" ENABLE ROW LEVEL SECURITY;

--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;

--
-- Name: pokemap_saved_shops insert_own_saved_shops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert_own_saved_shops" ON "public"."pokemap_saved_shops" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: local_stores local stores readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "local stores readable" ON "public"."local_stores" FOR SELECT USING ((("is_published" = true) OR "public"."is_admin"()));


--
-- Name: local_featured_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_featured_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_meetup_attendees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_meetup_attendees" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_meetups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_meetups" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_stores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."local_stores" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_price_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_price_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_prices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_prices" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_product_price_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_product_price_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: market_watchlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."market_watchlist" ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."marketplace_listings" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_meetups meetups readable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "meetups readable" ON "public"."local_meetups" FOR SELECT USING ((("status" = 'published'::"text") OR ("created_by" = "auth"."uid"()) OR "public"."is_admin"()));


--
-- Name: milestone_definitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."milestone_definitions" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: local_meetups owners or admins delete meetups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owners or admins delete meetups" ON "public"."local_meetups" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR "public"."is_admin"()));


--
-- Name: local_meetups owners or admins update meetups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "owners or admins update meetups" ON "public"."local_meetups" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR "public"."is_admin"())) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."is_admin"()));


--
-- Name: pokemap_saved_shops; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pokemap_saved_shops" ENABLE ROW LEVEL SECURITY;

--
-- Name: pokemon_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pokemon_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: pokemon_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pokemon_sets" ENABLE ROW LEVEL SECURITY;

--
-- Name: poketrace_api_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."poketrace_api_cache" ENABLE ROW LEVEL SECURITY;

--
-- Name: price_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."price_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."price_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: price_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."price_observations" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_review_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pricing_review_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."pricing_sources" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_card_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."provider_card_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_mappings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."provider_mappings" ENABLE ROW LEVEL SECURITY;

--
-- Name: provider_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."provider_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: scan_training_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."scan_training_data" ENABLE ROW LEVEL SECURITY;

--
-- Name: sealed_product_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sealed_product_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: sealed_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sealed_products" ENABLE ROW LEVEL SECURITY;

--
-- Name: pokemap_saved_shops select_own_saved_shops; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "select_own_saved_shops" ON "public"."pokemap_saved_shops" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "user_id"));


--
-- Name: seller_inventory_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."seller_inventory_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_sale_transaction_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."seller_sale_transaction_items" ENABLE ROW LEVEL SECURITY;

--
-- Name: seller_sale_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."seller_sale_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: social_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."social_posts" ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_errors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sync_errors" ENABLE ROW LEVEL SECURITY;

--
-- Name: sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."sync_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: tcg_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tcg_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: tcg_series; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tcg_series" ENABLE ROW LEVEL SECURITY;

--
-- Name: tcg_sets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."tcg_sets" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_cash_terms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_cash_terms" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_listings" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_offer_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_offer_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_offer_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_offer_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_offers" ENABLE ROW LEVEL SECURITY;

--
-- Name: trade_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trade_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: trader_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trader_ratings" ENABLE ROW LEVEL SECURITY;

--
-- Name: trades; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."trades" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievement_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_achievement_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_achievements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_achievements" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_card_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_card_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_card_variants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_card_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_coin_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_coin_ledger" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_cosmetics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_cosmetics" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_follows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_follows" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_milestones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_milestones" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pokedex_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."user_pokedex_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "id"));


--
-- Name: profiles users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("auth"."uid"() = "id"));


--
-- Name: profiles users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));


--
-- Name: local_meetups users create meetups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users create meetups" ON "public"."local_meetups" FOR INSERT WITH CHECK (("created_by" = "auth"."uid"()));


--
-- Name: local_meetup_attendees users manage own meetup attendance; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users manage own meetup attendance" ON "public"."local_meetup_attendees" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: wanted_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE "public"."wanted_cards" ENABLE ROW LEVEL SECURITY;

--
-- Name: wanted_cards wanted_cards_modify_self; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wanted_cards_modify_self" ON "public"."wanted_cards" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: wanted_cards wanted_cards_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "wanted_cards_select_authenticated" ON "public"."wanted_cards" FOR SELECT TO "authenticated" USING (true);


--
-- PostgreSQL database dump complete
--
