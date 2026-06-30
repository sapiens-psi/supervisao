
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'professor');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-grant admin role to manually-invited users
CREATE OR REPLACE FUNCTION public.handle_new_user_grant_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created_grant_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_grant_admin();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Supervisions
CREATE TABLE public.supervisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  max_students INTEGER NOT NULL CHECK (max_students > 0),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.supervisions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisions TO authenticated;
GRANT ALL ON public.supervisions TO service_role;
ALTER TABLE public.supervisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supervisions public read" ON public.supervisions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "supervisions admin insert" ON public.supervisions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "supervisions admin update" ON public.supervisions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "supervisions admin delete" ON public.supervisions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_supervisions_updated BEFORE UPDATE ON public.supervisions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Registrations
CREATE TABLE public.supervision_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervision_id UUID NOT NULL REFERENCES public.supervisions(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0 AND length(first_name) <= 80),
  last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0 AND length(last_name) <= 80),
  email TEXT NOT NULL CHECK (length(email) <= 255 AND position('@' in email) > 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  canceled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uniq_reg_active_email
  ON public.supervision_registrations (supervision_id, lower(email))
  WHERE canceled_at IS NULL;
CREATE INDEX idx_reg_sup ON public.supervision_registrations (supervision_id) WHERE canceled_at IS NULL;

GRANT SELECT, INSERT ON public.supervision_registrations TO anon;
GRANT SELECT, INSERT, UPDATE ON public.supervision_registrations TO authenticated;
GRANT ALL ON public.supervision_registrations TO service_role;
ALTER TABLE public.supervision_registrations ENABLE ROW LEVEL SECURITY;

-- Public can insert only if capacity not reached and event in future
CREATE OR REPLACE FUNCTION public.can_register(_supervision_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supervisions s
    WHERE s.id = _supervision_id
      AND s.starts_at > now()
      AND (SELECT count(*) FROM public.supervision_registrations r
           WHERE r.supervision_id = s.id AND r.canceled_at IS NULL) < s.max_students
  )
$$;

CREATE POLICY "reg public insert with capacity" ON public.supervision_registrations
  FOR INSERT TO anon, authenticated
  WITH CHECK (canceled_at IS NULL AND public.can_register(supervision_id));

-- Public can read only minimal info? They submit a form once. For confirmation page we let them see count via aggregation by RPC. Don't expose PII.
-- Admins can read everything and cancel.
CREATE POLICY "reg admin read" ON public.supervision_registrations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "reg admin update" ON public.supervision_registrations FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Public function to get available seats count
CREATE OR REPLACE FUNCTION public.supervision_seats(_slug TEXT)
RETURNS TABLE (id UUID, title TEXT, description TEXT, location TEXT, starts_at TIMESTAMPTZ, duration_minutes INT, max_students INT, taken INT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.title, s.description, s.location, s.starts_at, s.duration_minutes, s.max_students,
    (SELECT count(*)::int FROM public.supervision_registrations r WHERE r.supervision_id = s.id AND r.canceled_at IS NULL) AS taken
  FROM public.supervisions s WHERE s.slug = _slug
$$;
GRANT EXECUTE ON FUNCTION public.supervision_seats(TEXT) TO anon, authenticated;

-- Reminder log
CREATE TABLE public.reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.supervision_registrations(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('5d','1d','1h')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (registration_id, reminder_type)
);
GRANT ALL ON public.reminder_log TO service_role;
ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;
-- Service-role only; no policies for anon/authenticated.
