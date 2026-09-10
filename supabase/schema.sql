-- MTH Attendance Platform — multi-term, multi-section schema
-- Run once in a fresh Supabase project's SQL Editor. Fully idempotent —
-- safe to re-run in full any time.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- PROFILES  (every human who can log in — superadmin or instructor)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  email text,                                  -- their real email, for the supervisor to reach them
  role text not null default 'instructor' check (role in ('superadmin', 'instructor')),
  must_change_password boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- COURSES  (defaults to MTH 101, but not hardcoded — costs nothing to keep flexible)
-- ---------------------------------------------------------------------------
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,          -- e.g. "MTH 101"
  title text,                  -- e.g. "Intermediate Algebra"
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- TERMS  (e.g. "Fall 2026") — one start/end date range, shared by all sections in it
-- ---------------------------------------------------------------------------
create table if not exists terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,          -- e.g. "Fall 2026"
  start_date date not null,
  end_date date not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- SECTIONS  (e.g. MTH 101, section 003, Fall 2026)
-- ---------------------------------------------------------------------------
create table if not exists sections (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references terms(id) on delete cascade,
  course_id uuid not null references courses(id),
  section_number text not null,   -- entered by the supervisor, e.g. "003"
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (term_id, course_id, section_number)
);

-- One row per weekday a section meets. Independent start/end time per day,
-- since Mon/Wed commonly run longer than Tue/Thu.
create table if not exists section_schedule (
  section_id uuid not null references sections(id) on delete cascade,
  weekday int not null check (weekday between 1 and 4),  -- 1=Mon .. 4=Thu (no Friday for now)
  start_time time not null,
  end_time time not null,
  checkin_window_minutes int not null default 10,
  late_grace_minutes int not null default 10,
  primary key (section_id, weekday)
);

-- Any date an instructor marks as a no-class day for their own section
-- (fall break, a snow day, a one-off cancellation — anything beyond the
-- automatically-computed federal holidays).
create table if not exists section_holidays (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  holiday_date date not null,
  label text,
  added_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique (section_id, holiday_date)
);

-- ---------------------------------------------------------------------------
-- INSTRUCTOR_SECTIONS  (assignment table — the core of who can see what)
-- ---------------------------------------------------------------------------
create table if not exists instructor_sections (
  instructor_id uuid not null references profiles(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  role text not null default 'lead' check (role in ('lead', 'support')),
  assigned_by uuid references profiles(id),
  assigned_at timestamptz default now(),
  primary key (instructor_id, section_id)
);

-- ---------------------------------------------------------------------------
-- STUDENTS  (scoped to ONE section — this is what keeps sections isolated)
-- ---------------------------------------------------------------------------
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  m_number text not null,
  full_name text not null,
  email text,
  photo_url text,
  active boolean not null default true,
  is_test boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (section_id, m_number)
);

create index if not exists idx_students_section on students (section_id);
create index if not exists idx_students_mnumber on students (section_id, upper(m_number));

-- ---------------------------------------------------------------------------
-- GRADE_SNAPSHOTS  (the latest Brightspace upload per section — persists
-- until the next upload replaces it; feeds the grade-redlist)
-- ---------------------------------------------------------------------------
create table if not exists grade_snapshots (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now(),
  data jsonb not null    -- [{m_number, full_name, pct}], the parsed grade export
);

create index if not exists idx_grade_snapshots_section on grade_snapshots (section_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- CLASS_SESSIONS
-- ---------------------------------------------------------------------------
create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  session_date date not null,
  label text,
  created_by uuid references profiles(id),
  checkin_opened_at timestamptz,
  checkin_closes_at timestamptz,
  created_at timestamptz default now(),
  unique (section_id, session_date)
);

create index if not exists idx_sessions_section on class_sessions (section_id);

-- ---------------------------------------------------------------------------
-- CHECKIN_TOKENS  (rotating QR history — same design as before)
-- ---------------------------------------------------------------------------
create table if not exists checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  token text not null,
  issued_at timestamptz not null default now()
);

create index if not exists idx_checkin_tokens_lookup on checkin_tokens (session_id, token);
alter table checkin_tokens enable row level security;
-- no policies for anyone — only SECURITY DEFINER functions touch this table

-- ---------------------------------------------------------------------------
-- DEVICE_CHECKINS  (anti-proxy-signing: tracks the last student a given
-- device checked in, per section, so the same phone can't immediately
-- check in someone else)
-- ---------------------------------------------------------------------------
create table if not exists device_checkins (
  device_token text not null,
  section_id uuid not null references sections(id) on delete cascade,
  last_student_id uuid references students(id),
  last_checked_in_at timestamptz not null default now(),
  primary key (device_token, section_id)
);

alter table device_checkins enable row level security;
-- no policies for anyone — only SECURITY DEFINER functions touch this table

-- ---------------------------------------------------------------------------
-- ATTENDANCE
-- ---------------------------------------------------------------------------
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status int not null default 1,
  method text not null default 'scan',
  marked_by uuid references profiles(id),
  checked_in_at timestamptz default now(),
  unique (session_id, student_id)
);

create index if not exists idx_attendance_session on attendance (session_id);
create index if not exists idx_attendance_student on attendance (student_id);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table attendance;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- REDLIST_CONTACTS
-- ---------------------------------------------------------------------------
create table if not exists redlist_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  reason text not null check (reason in ('attendance', 'grade')),
  tier text not null check (tier in ('initial', 'follow_up', 'second_follow_up')),
  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now()
);

create index if not exists idx_redlist_contacts_student on redlist_contacts (student_id, reason);

-- ---------------------------------------------------------------------------
-- BACKUPS  (one row per login-triggered snapshot — real, in-database backup)
-- ---------------------------------------------------------------------------
create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  triggered_by uuid references profiles(id),
  scope text not null,        -- 'all' (superadmin) or a specific section_id as text
  snapshot jsonb not null
);

create index if not exists idx_backups_created on backups (created_at desc);

-- ---------------------------------------------------------------------------
-- HELPER FUNCTIONS  (used throughout RLS policies below)
-- ---------------------------------------------------------------------------
create or replace function is_superadmin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'superadmin'
  );
$$;

create or replace function has_section_access(p_section_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select is_superadmin() or exists (
    select 1 from instructor_sections
     where section_id = p_section_id and instructor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table courses enable row level security;
alter table terms enable row level security;
alter table sections enable row level security;
alter table section_schedule enable row level security;
alter table section_holidays enable row level security;
alter table instructor_sections enable row level security;
alter table students enable row level security;
alter table grade_snapshots enable row level security;
alter table class_sessions enable row level security;
alter table attendance enable row level security;
alter table redlist_contacts enable row level security;
alter table backups enable row level security;

-- profiles: everyone authenticated can see the (non-sensitive) directory —
-- needed for dropdowns like "assign instructor to section" and to display
-- names on section cards. Only superadmin (or the person themself) can write.
drop policy if exists "read profiles" on profiles;
create policy "read profiles" on profiles for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes profiles" on profiles;
create policy "superadmin writes profiles" on profiles for insert with check (is_superadmin());
drop policy if exists "update own or superadmin" on profiles;
create policy "update own or superadmin" on profiles for update using (id = auth.uid() or is_superadmin());
drop policy if exists "superadmin deletes profiles" on profiles;
create policy "superadmin deletes profiles" on profiles for delete using (is_superadmin());

-- courses/terms: everyone authenticated can read; only superadmin writes
drop policy if exists "read courses" on courses;
create policy "read courses" on courses for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes courses" on courses;
create policy "superadmin writes courses" on courses for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "read terms" on terms;
create policy "read terms" on terms for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes terms" on terms;
create policy "superadmin writes terms" on terms for all using (is_superadmin()) with check (is_superadmin());

-- sections: everyone authenticated can read (needed to browse/assign);
-- only superadmin creates/edits/archives/deletes
drop policy if exists "read sections" on sections;
create policy "read sections" on sections for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes sections" on sections;
create policy "superadmin writes sections" on sections for all using (is_superadmin()) with check (is_superadmin());

drop policy if exists "read section_schedule" on section_schedule;
create policy "read section_schedule" on section_schedule for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes section_schedule" on section_schedule;
create policy "superadmin writes section_schedule" on section_schedule for all using (is_superadmin()) with check (is_superadmin());

-- section_holidays: assigned instructors (lead or support) can add/remove
-- their own section's no-class days — this is deliberately NOT
-- superadmin-only, per how it was scoped
drop policy if exists "read section_holidays" on section_holidays;
create policy "read section_holidays" on section_holidays for select using (auth.role() = 'authenticated');
drop policy if exists "assigned instructors write section_holidays" on section_holidays;
create policy "assigned instructors write section_holidays" on section_holidays for all
  using (has_section_access(section_id)) with check (has_section_access(section_id));

-- instructor_sections: everyone authenticated can read (needed for section
-- cards to show who's on them); only superadmin assigns/unassigns
drop policy if exists "read instructor_sections" on instructor_sections;
create policy "read instructor_sections" on instructor_sections for select using (auth.role() = 'authenticated');
drop policy if exists "superadmin writes instructor_sections" on instructor_sections;
create policy "superadmin writes instructor_sections" on instructor_sections for all using (is_superadmin()) with check (is_superadmin());

-- students, grade_snapshots, class_sessions, attendance, redlist_contacts:
-- the real isolation boundary — only superadmin or an instructor actually
-- assigned to that section can see or touch its data. This is enforced
-- here, at the database, not just hidden in the UI.
drop policy if exists "section-scoped read students" on students;
create policy "section-scoped read students" on students for select using (has_section_access(section_id));
drop policy if exists "section-scoped write students" on students;
create policy "section-scoped write students" on students for all
  using (has_section_access(section_id)) with check (has_section_access(section_id));

drop policy if exists "section-scoped read grade_snapshots" on grade_snapshots;
create policy "section-scoped read grade_snapshots" on grade_snapshots for select using (has_section_access(section_id));
drop policy if exists "section-scoped write grade_snapshots" on grade_snapshots;
create policy "section-scoped write grade_snapshots" on grade_snapshots for insert with check (has_section_access(section_id));

drop policy if exists "section-scoped read sessions" on class_sessions;
create policy "section-scoped read sessions" on class_sessions for select using (has_section_access(section_id));
drop policy if exists "section-scoped write sessions" on class_sessions;
create policy "section-scoped write sessions" on class_sessions for all
  using (has_section_access(section_id)) with check (has_section_access(section_id));

-- attendance has no section_id column directly — access is derived through
-- its session's section
drop policy if exists "section-scoped read attendance" on attendance;
create policy "section-scoped read attendance" on attendance for select using (
  exists (select 1 from class_sessions s where s.id = session_id and has_section_access(s.section_id))
);
drop policy if exists "section-scoped write attendance" on attendance;
create policy "section-scoped write attendance" on attendance for all using (
  exists (select 1 from class_sessions s where s.id = session_id and has_section_access(s.section_id))
) with check (
  exists (select 1 from class_sessions s where s.id = session_id and has_section_access(s.section_id))
);

drop policy if exists "section-scoped read redlist" on redlist_contacts;
create policy "section-scoped read redlist" on redlist_contacts for select using (has_section_access(section_id));
drop policy if exists "section-scoped write redlist" on redlist_contacts;
create policy "section-scoped write redlist" on redlist_contacts for insert with check (has_section_access(section_id));

-- backups: superadmin sees everything; an instructor only ever sees backup
-- rows scoped to a section they're assigned to
drop policy if exists "scoped read backups" on backups;
create policy "scoped read backups" on backups for select using (
  is_superadmin() or scope in (
    select section_id::text from instructor_sections where instructor_id = auth.uid()
  )
);
drop policy if exists "authenticated write backups" on backups;
drop policy if exists "scoped write backups" on backups;
create policy "scoped write backups" on backups for insert with check (
  is_superadmin() or (scope <> 'all' and has_section_access(scope::uuid))
);

-- Anonymous students (the check-in page) get zero direct table access,
-- exactly like before — everything they can do goes through the
-- SECURITY DEFINER functions below.
revoke all on students, class_sessions, attendance, profiles, sections, section_schedule,
  section_holidays, instructor_sections, terms, courses, grade_snapshots, redlist_contacts,
  backups, checkin_tokens, device_checkins from anon;

-- ---------------------------------------------------------------------------
-- rotate_token()
-- ---------------------------------------------------------------------------
create or replace function rotate_token(p_session_id uuid, p_ttl_seconds int default 15)
returns table (token text, expires_at timestamptz)
language plpgsql
security definer
as $$
declare
  v_token text;
  v_expires timestamptz;
  v_section_id uuid;
begin
  select section_id into v_section_id from class_sessions where id = p_session_id;
  if v_section_id is null or not has_section_access(v_section_id) then
    raise exception 'not authorized';
  end if;

  v_token := encode(gen_random_bytes(16), 'hex');
  v_expires := now() + make_interval(secs => p_ttl_seconds);

  insert into checkin_tokens (session_id, token) values (p_session_id, v_token);

  update class_sessions
     set checkin_opened_at = coalesce(checkin_opened_at, now())
   where id = p_session_id;

  delete from checkin_tokens
   where session_id = p_session_id and issued_at < now() - interval '30 minutes';

  return query select v_token, v_expires;
end;
$$;

grant execute on function rotate_token(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- check_in()
--
-- Validates: the token was issued recently (grace window), the class time
-- window, one-time-use per student, AND — new in this version — that the
-- same device isn't being used to check in multiple different students in
-- quick succession (the anti-proxy-signing check). p_device_token is a
-- random id the student's browser generates once and reuses; it identifies
-- a device, not a person.
-- ---------------------------------------------------------------------------
create or replace function check_in(
  p_session_id uuid,
  p_token text,
  p_m_number text,
  p_device_token text default null
)
returns table (
  ok boolean,
  message text,
  student_name text,
  photo_url text
)
language plpgsql
security definer
as $$
declare
  v_session class_sessions%rowtype;
  v_student students%rowtype;
  v_existing attendance%rowtype;
  v_last_device device_checkins%rowtype;
  v_grace interval := interval '4 minutes';
  v_device_cooldown interval := interval '5 minutes';
begin
  select * into v_session from class_sessions where id = p_session_id;

  if not found then
    return query select false, 'This check-in link isn''t valid.', null::text, null::text; return;
  end if;

  if not exists (
    select 1 from checkin_tokens
     where session_id = p_session_id
       and token = p_token
       and issued_at >= now() - v_grace
  ) then
    return query select false, 'This code has expired — rescan the current QR code on the screen.', null::text, null::text; return;
  end if;

  if v_session.checkin_closes_at is not null and now() > v_session.checkin_closes_at then
    return query select false, 'Check-in for this class has closed.', null::text, null::text; return;
  end if;

  -- section-scoped student lookup: an M-number is only ever matched within
  -- THIS session's section, so a student from another section's roster
  -- can't accidentally (or deliberately) check in here even if they know
  -- the M-number format
  select * into v_student from students
   where section_id = v_session.section_id
     and upper(m_number) = upper(trim(p_m_number))
     and active = true;

  if not found then
    return query select false, 'We couldn''t find that M-number on this class''s roster. Double check the digits, or see your instructor.', null::text, null::text; return;
  end if;

  select * into v_existing from attendance where session_id = p_session_id and student_id = v_student.id;

  if found and v_existing.status = 1 then
    return query select false, 'You''re already checked in for today, ' || split_part(v_student.full_name, ' ', 1) || '!', v_student.full_name, v_student.photo_url; return;
  end if;

  -- anti-proxy-signing check: has this device just checked in a DIFFERENT
  -- student for this section within the cooldown window?
  if p_device_token is not null then
    select * into v_last_device from device_checkins
     where device_token = p_device_token and section_id = v_session.section_id;

    if found
       and v_last_device.last_student_id is distinct from v_student.id
       and v_last_device.last_checked_in_at >= now() - v_device_cooldown then
      return query select false, 'This device was just used to check in someone else. If you''re sharing a device, wait a few minutes and try again, or ask your instructor for help.', null::text, null::text; return;
    end if;
  end if;

  insert into attendance (session_id, student_id, status, method)
  values (p_session_id, v_student.id, 1, 'scan')
  on conflict (session_id, student_id) do update
    set status = 1, method = 'scan', checked_in_at = now(), marked_by = null;

  if p_device_token is not null then
    insert into device_checkins (device_token, section_id, last_student_id, last_checked_in_at)
    values (p_device_token, v_session.section_id, v_student.id, now())
    on conflict (device_token, section_id) do update
      set last_student_id = v_student.id, last_checked_in_at = now();
  end if;

  return query select true, 'Checked in', v_student.full_name, v_student.photo_url;
end;
$$;

grant execute on function check_in(uuid, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- reset_all_data()  — superadmin-only, guarded, destructive.
--
-- Clears every term/section/roster/attendance/grade/redlist/holiday record
-- back to blank. Deliberately does NOT touch: profiles (instructor and
-- superadmin logins survive), courses, or backups (so a snapshot taken
-- right before a reset is still recoverable afterward).
-- ---------------------------------------------------------------------------
create or replace function reset_all_data()
returns void
language plpgsql
security definer
as $$
begin
  if not is_superadmin() then
    raise exception 'Only a superadmin can do this.';
  end if;

  delete from redlist_contacts;
  delete from attendance;
  delete from checkin_tokens;
  delete from device_checkins;
  delete from class_sessions;
  delete from grade_snapshots;
  delete from students;
  delete from section_holidays;
  delete from instructor_sections;
  delete from section_schedule;
  delete from sections;
  delete from terms;
end;
$$;

grant execute on function reset_all_data() to authenticated;

-- ---------------------------------------------------------------------------
-- TOOLTIP_DISMISSALS  (per-user "I've seen this, stop showing it" state —
-- persisted per person, so it follows them across devices, not just one
-- browser's localStorage)
-- ---------------------------------------------------------------------------
create table if not exists tooltip_dismissals (
  user_id uuid not null references profiles(id) on delete cascade,
  tooltip_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, tooltip_key)
);

alter table tooltip_dismissals enable row level security;

drop policy if exists "own tooltip dismissals" on tooltip_dismissals;
create policy "own tooltip dismissals" on tooltip_dismissals for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- STORAGE (student photos, uploaded via the Roster tab)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('student-photos', 'student-photos', true)
on conflict (id) do nothing;

drop policy if exists "public read student photos" on storage.objects;
create policy "public read student photos" on storage.objects for select using (bucket_id = 'student-photos');

drop policy if exists "instructors manage student photos" on storage.objects;
create policy "instructors manage student photos" on storage.objects for insert with check (bucket_id = 'student-photos' and auth.role() = 'authenticated');

drop policy if exists "instructors update student photos" on storage.objects;
create policy "instructors update student photos" on storage.objects for update using (bucket_id = 'student-photos' and auth.role() = 'authenticated');

drop policy if exists "instructors delete student photos" on storage.objects;
create policy "instructors delete student photos" on storage.objects for delete using (bucket_id = 'student-photos' and auth.role() = 'authenticated');




