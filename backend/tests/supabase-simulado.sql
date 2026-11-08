create extension if not exists pgcrypto;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text,
  encrypted_password text, email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
-- Columnas y tabla que Supabase Auth tiene y que usan los datos de demostración
alter table auth.users add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text;
create table if not exists auth.identities (id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  provider_id text not null, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
