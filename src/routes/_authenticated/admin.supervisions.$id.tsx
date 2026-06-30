import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupervisionWithRegistrations, updateSupervision, cancelRegistration } from "@/lib/supervisions";
import { SupervisionForm } from "@/components/SupervisionForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/supervisions/$id")({
  head: () => ({ meta: [{ title: "Supervisão" }] }),
  component: DetailPage,
});

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["supervision", id],
    queryFn: () => getSupervisionWithRegistrations(id),
  });

  if (isLoading || !data) return <div className="p-8 text-muted-foreground">Carregando…</div>;
  const { supervision, registrations } = data;
  const active = registrations.filter((r) => !r.canceled_at);
  const link = `${typeof window !== "undefined" ? window.location.origin : ""}/e/${supervision.slug}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/classes/$classId" params={{ classId: supervision.class_id ?? "" }}>
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar para turma
          </Link>
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Link de inscrição</CardTitle>
            <CardDescription>Compartilhe com os alunos da turma.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2 rounded bg-muted text-sm truncate">{link}</code>
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link); toast.success("Copiado"); }}>
              <Copy className="w-4 h-4 mr-1" />Copiar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Editar supervisão</CardTitle>
            <CardDescription>{active.length} de {supervision.max_students} vagas preenchidas</CardDescription>
          </CardHeader>
          <CardContent>
            <SupervisionForm
              initial={{
                title: supervision.title,
                description: supervision.description ?? "",
                location: supervision.location ?? "",
                starts_at: toLocalInput(supervision.starts_at),
                duration_minutes: supervision.duration_minutes,
                max_students: supervision.max_students,
              }}
              onSubmit={async (v) => {
                try {
                  await updateSupervision(supervision.id, {
                    title: v.title.trim(),
                    description: v.description.trim() || null,
                    location: v.location.trim() || null,
                    starts_at: new Date(v.starts_at).toISOString(),
                    duration_minutes: v.duration_minutes,
                    max_students: v.max_students,
                  } as any);
                  toast.success("Atualizado");
                  qc.invalidateQueries({ queryKey: ["supervision", id] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Erro");
                }
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Alunos inscritos</CardTitle>
            <CardDescription>{active.length} confirmações ativas</CardDescription>
          </CardHeader>
          <CardContent>
            {registrations.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma inscrição ainda.</p>
            ) : (
              <ul className="divide-y">
                {registrations.map((r) => (
                  <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {r.first_name} {r.last_name}
                        {r.canceled_at && <Badge variant="secondary" className="ml-2">Cancelado</Badge>}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">{r.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Inscrito em {format(new Date(r.created_at), "PPp", { locale: ptBR })}
                      </p>
                    </div>
                    {!r.canceled_at && (
                      <Button variant="outline" size="sm" onClick={async () => {
                        if (!confirm(`Cancelar a vaga de ${r.first_name}?`)) return;
                        try { await cancelRegistration(r.id); toast.success("Vaga cancelada"); refetch(); }
                        catch (e: any) { toast.error(e?.message ?? "Erro"); }
                      }}>
                        <X className="w-4 h-4 mr-1" />Cancelar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}