-- Roundwise · 0805 · Admin UI offers three description sources (own file:
-- a new enum value must be committed before it can be used).
alter type public.description_source add value if not exists 'student_submitted';
