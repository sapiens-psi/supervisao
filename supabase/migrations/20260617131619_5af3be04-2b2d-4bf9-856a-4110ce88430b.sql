
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;

CREATE TABLE public.programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "programs admin read" ON public.programs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "programs admin insert" ON public.programs FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "programs admin update" ON public.programs FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "programs admin delete" ON public.programs FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_programs_updated BEFORE UPDATE ON public.programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 120),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_classes_program ON public.classes(program_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT ALL ON public.classes TO service_role;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "classes admin read" ON public.classes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "classes admin insert" ON public.classes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "classes admin update" ON public.classes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "classes admin delete" ON public.classes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_classes_updated BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.supervisions ADD COLUMN class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;
CREATE INDEX idx_sup_class ON public.supervisions(class_id);

DROP FUNCTION IF EXISTS public.supervision_seats(TEXT);
CREATE OR REPLACE FUNCTION public.supervision_seats(_slug TEXT)
RETURNS TABLE (id UUID, title TEXT, description TEXT, location TEXT, starts_at TIMESTAMPTZ, duration_minutes INT, max_students INT, taken INT, class_name TEXT, program_name TEXT)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.title, s.description, s.location, s.starts_at, s.duration_minutes, s.max_students,
    (SELECT count(*)::int FROM public.supervision_registrations r WHERE r.supervision_id = s.id AND r.canceled_at IS NULL) AS taken,
    c.name AS class_name,
    p.name AS program_name
  FROM public.supervisions s
  LEFT JOIN public.classes c ON c.id = s.class_id
  LEFT JOIN public.programs p ON p.id = c.program_id
  WHERE s.slug = _slug
$$;
GRANT EXECUTE ON FUNCTION public.supervision_seats(TEXT) TO anon, authenticated;
