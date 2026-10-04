-- Bảng lưu tiến trình game theo tài khoản. Chạy trong Supabase → SQL Editor.
create table if not exists public.game_saves (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint game_saves_size check (pg_column_size(data) < 200000)
);

alter table public.game_saves enable row level security;

revoke all on public.game_saves from anon;
grant select, insert, update on public.game_saves to authenticated;

drop policy if exists "game_saves_select_own" on public.game_saves;
drop policy if exists "game_saves_insert_own" on public.game_saves;
drop policy if exists "game_saves_update_own" on public.game_saves;
create policy "game_saves_select_own" on public.game_saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "game_saves_insert_own" on public.game_saves for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "game_saves_update_own" on public.game_saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- updated_at do server đặt, không tin đồng hồ của máy người chơi
create or replace function public.game_saves_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists game_saves_touch on public.game_saves;
create trigger game_saves_touch before insert or update on public.game_saves
  for each row execute function public.game_saves_touch();
