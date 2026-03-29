ALTER TABLE public.generated_contents DROP CONSTRAINT generated_contents_status_check;

ALTER TABLE public.generated_contents ADD CONSTRAINT generated_contents_status_check CHECK (status = ANY (ARRAY['draft'::text, 'approved'::text, 'scheduled'::text, 'published'::text, 'rejected'::text, 'ready'::text, 'downloaded'::text]));