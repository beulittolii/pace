-- Browser clients cannot access this private bucket directly (no RLS grants).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assessment-pdfs', 'assessment-pdfs', false, 5242880, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
