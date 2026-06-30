import { supabase } from "@/integrations/supabase/client";

export interface Program {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface ClassRow {
  id: string;
  program_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Supervision {
  id: string;
  slug: string;
  class_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  duration_minutes: number;
  max_students: number;
  created_at: string;
  updated_at: string;
}

export interface Registration {
  id: string;
  supervision_id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  canceled_at: string | null;
}

const s = supabase as unknown as ReturnType<typeof getDb>;
function getDb() { return supabase; }

export async function listPrograms(): Promise<Program[]> {
  const { data, error } = await (supabase as any)
    .from("programs").select("*").order("name");
  if (error) throw error;
  return data as Program[];
}

export async function getProgram(id: string): Promise<Program | null> {
  const { data, error } = await (supabase as any)
    .from("programs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Program | null;
}

export async function createProgram(input: { name: string; description?: string }) {
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await (supabase as any)
    .from("programs").insert({ ...input, created_by: user?.id }).select().single();
  if (error) throw error;
  return data as Program;
}

export async function deleteProgram(id: string) {
  const { error } = await (supabase as any).from("programs").delete().eq("id", id);
  if (error) throw error;
}

export async function listClasses(programId: string): Promise<ClassRow[]> {
  const { data, error } = await (supabase as any)
    .from("classes").select("*").eq("program_id", programId).order("created_at");
  if (error) throw error;
  return data as ClassRow[];
}

export async function getClass(id: string): Promise<ClassRow | null> {
  const { data, error } = await (supabase as any)
    .from("classes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ClassRow | null;
}

export async function createClass(input: { program_id: string; name: string; description?: string }) {
  const user = (await supabase.auth.getUser()).data.user;
  const { data, error } = await (supabase as any)
    .from("classes").insert({ ...input, created_by: user?.id }).select().single();
  if (error) throw error;
  return data as ClassRow;
}

export async function deleteClass(id: string) {
  const { error } = await (supabase as any).from("classes").delete().eq("id", id);
  if (error) throw error;
}

export async function listSupervisionsByClass(classId: string): Promise<Supervision[]> {
  const { data, error } = await (supabase as any)
    .from("supervisions").select("*").eq("class_id", classId)
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return data as Supervision[];
}

export async function listSupervisionsByClassWithSeats(
  classId: string,
): Promise<(Supervision & { taken: number })[]> {
  const sups = await listSupervisionsByClass(classId);
  if (sups.length === 0) return [];
  const ids = sups.map((s) => s.id);
  const { data, error } = await (supabase as any)
    .from("supervision_registrations")
    .select("supervision_id")
    .in("supervision_id", ids)
    .is("canceled_at", null);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { supervision_id: string }[]) {
    counts.set(r.supervision_id, (counts.get(r.supervision_id) ?? 0) + 1);
  }
  return sups.map((s) => ({ ...s, taken: counts.get(s.id) ?? 0 }));
}

export async function listSupervisions(): Promise<Supervision[]> {
  const { data, error } = await (supabase as any)
    .from("supervisions")
    .select("*")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return data as Supervision[];
}

export async function getSupervisionBySlug(slug: string) {
  const { data, error } = await (supabase as any).rpc("supervision_seats", { _slug: slug });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as (Supervision & { taken: number }) | null;
}

export async function getSupervisionWithRegistrations(id: string) {
  const [sup, regs] = await Promise.all([
    (supabase as any).from("supervisions").select("*").eq("id", id).maybeSingle(),
    (supabase as any)
      .from("supervision_registrations")
      .select("*")
      .eq("supervision_id", id)
      .order("created_at", { ascending: true }),
  ]);
  if (sup.error) throw sup.error;
  if (regs.error) throw regs.error;
  return { supervision: sup.data as Supervision, registrations: regs.data as Registration[] };
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export async function createSupervision(input: {
  class_id: string;
  title: string;
  description?: string;
  location?: string;
  starts_at: string;
  duration_minutes: number;
  max_students: number;
}) {
  const user = (await supabase.auth.getUser()).data.user;
  const base = slugify(input.title) || "supervisao";
  const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await (supabase as any)
    .from("supervisions")
    .insert({ ...input, slug, created_by: user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Supervision;
}

export async function updateSupervision(id: string, patch: Partial<Supervision>) {
  const { error } = await (supabase as any).from("supervisions").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteSupervision(id: string) {
  const { error } = await (supabase as any).from("supervisions").delete().eq("id", id);
  if (error) throw error;
}

export async function cancelRegistration(id: string) {
  const user = (await supabase.auth.getUser()).data.user;
  const { error } = await (supabase as any)
    .from("supervision_registrations")
    .update({ canceled_at: new Date().toISOString(), canceled_by: user?.id })
    .eq("id", id);
  if (error) throw error;
}

export async function registerStudent(supervisionId: string, input: {
  first_name: string;
  last_name: string;
  email: string;
}) {
  const { error } = await (supabase as any)
    .from("supervision_registrations")
    .insert({ supervision_id: supervisionId, ...input, email: input.email.toLowerCase().trim() });
  if (error) throw error;
}

export interface SmtpConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string | null;
  use_tls: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminUser {
  id: string;
  email: string | null;
  name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  roles: string[];
}

async function getFunctionErrorMessage(error: any) {
  let message = error?.message ?? "Erro ao executar Edge Function";
  const response = error?.context;
  if (response instanceof Response) {
    const payload = await response.json().catch(() => null);
    if (payload && typeof payload === "object" && "error" in payload) {
      message = String(payload.error);
    }
  }
  return message;
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const { data, error } = await supabase.functions.invoke("admin-smtp-config", {
    body: { action: "get" },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  return (data?.config ?? null) as SmtpConfig | null;
}

export async function saveSmtpConfig(input: Partial<SmtpConfig>) {
  const { data, error } = await supabase.functions.invoke("admin-smtp-config", {
    body: { action: "save", ...input },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  return data?.config as SmtpConfig;
}

export async function testSmtp(input: Partial<SmtpConfig> & { to: string }) {
  const { data, error } = await supabase.functions.invoke("admin-smtp-config", {
    body: { action: "test", ...input },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  return data?.message as string;
}

export async function listUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: { action: "list" },
  });
  if (error) throw new Error(await getFunctionErrorMessage(error));
  return (data?.users ?? []) as AdminUser[];
}

export { s };
