-- Бренчим: схема базы. Выполнить целиком в Supabase → SQL Editor.

create extension if not exists http with schema extensions;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  artist text not null default '' check (char_length(artist) <= 200),
  body text not null default '' check (char_length(body) <= 60000),
  youtube text check (youtube is null or youtube ~ '^[A-Za-z0-9_-]{11}$'),
  source_url text check (source_url is null or char_length(source_url) <= 500),
  added_by text check (added_by is null or char_length(added_by) <= 40),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- like = «хочу сыграть», canplay = «умею играть»
create table if not exists public.marks (
  song_id uuid not null references public.songs(id) on delete cascade,
  member text not null check (char_length(member) <= 40),
  kind text not null check (kind in ('like', 'canplay')),
  created_at timestamptz not null default now(),
  primary key (song_id, member, kind)
);

create table if not exists public.plays (
  id bigserial primary key,
  song_id uuid not null references public.songs(id) on delete cascade,
  member text check (member is null or char_length(member) <= 40),
  played_at timestamptz not null default now()
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Сет на вечер' check (char_length(title) <= 120),
  date date,
  song_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists songs_touch on public.songs;
create trigger songs_touch before update on public.songs for each row execute function public.touch_updated_at();
drop trigger if exists sets_touch on public.sets;
create trigger sets_touch before update on public.sets for each row execute function public.touch_updated_at();

-- Сайт открытый: читать и писать может любой, у кого есть ссылка.
alter table public.songs enable row level security;
alter table public.marks enable row level security;
alter table public.plays enable row level security;
alter table public.sets enable row level security;

do $$
declare t text;
begin
  foreach t in array array['songs', 'marks', 'plays', 'sets'] loop
    execute format('drop policy if exists "open read" on public.%I', t);
    execute format('drop policy if exists "open insert" on public.%I', t);
    execute format('drop policy if exists "open update" on public.%I', t);
    execute format('drop policy if exists "open delete" on public.%I', t);
    execute format('create policy "open read" on public.%I for select to anon, authenticated using (true)', t);
    execute format('create policy "open insert" on public.%I for insert to anon, authenticated with check (true)', t);
    execute format('create policy "open update" on public.%I for update to anon, authenticated using (true) with check (true)', t);
    execute format('create policy "open delete" on public.%I for delete to anon, authenticated using (true)', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;
grant usage, select on sequence public.plays_id_seq to anon, authenticated;

-- Прокси для импорта аккордов: браузер не может читать чужие сайты напрямую (CORS),
-- поэтому страницу забирает база. Только сайты из белого списка.
create or replace function public.proxy_get(url text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  res extensions.http_response;
begin
  if url !~ '^https://(amdm\.ru|tabs\.ultimate-guitar\.com|www\.ultimate-guitar\.com|www\.youtube\.com|www\.songsterr\.com|mychords\.net|akkords\.pro|pesnipodgitaru\.ru|www\.pisni\.org\.ua)/' then
    raise exception 'host not allowed';
  end if;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
  select * into res from extensions.http((
    'GET', url,
    array[
      extensions.http_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'),
      extensions.http_header('Accept-Language', 'ru,uk;q=0.9,en;q=0.8')
    ],
    null, null
  )::extensions.http_request);
  if res.status >= 400 then
    raise exception 'upstream status %', res.status;
  end if;
  return res.content;
end $$;

revoke all on function public.proxy_get(text) from public;
grant execute on function public.proxy_get(text) to anon, authenticated;
