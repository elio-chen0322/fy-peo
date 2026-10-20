-- Additive migration. Existing business tables and records are untouched.
CREATE TABLE IF NOT EXISTS public.peo_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  email text NOT NULL,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.peo_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.peo_members FROM anon, authenticated;
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('feedback-files','feedback-files',false,20000000)
ON CONFLICT(id) DO NOTHING;
-- After a member creates and verifies their account, the administrator can run:
-- INSERT INTO public.peo_members(user_id,email)
-- SELECT id,email FROM auth.users WHERE lower(email)=lower('member@example.com')
-- ON CONFLICT(user_id) DO UPDATE SET active=1,email=EXCLUDED.email;
