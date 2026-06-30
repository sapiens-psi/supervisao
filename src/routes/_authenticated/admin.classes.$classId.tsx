import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getClass, listSupervisionsByClassWithSeats, createSupervision, deleteSupervision,
} from "@/lib/supervisions";
import { SupervisionForm } from "@/components/SupervisionForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/classes/$classId")({
  head: () => ({ meta: [{ title: "Supervisões" }] }),
  component: ClassPage,
});

function ClassPage() {
  const { classId } = Route.useParams();
  const qc = useQueryClient();
  const { data: klass } = useQuery({ queryKey: ["class", classId], queryFn: () => getClass(classId) });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sups-by-class", classId],
    queryFn: () => listSupervisionsByClassWithSeats(classId),
  });
  const [open, setOpen] = useState(false);

  function copyLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/e/${slug}`);
    toast.success("Link copiado");
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta supervisão?")) return;
    try {
      await deleteSupervision(id);
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["sups-by-class", classId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" asChild className="-ml-3 mb-1">
              <Link to="/admin/programs/$programId" params={{ programId: klass?.program_id ?? "" }} disabled={!klass}>
                <ArrowLeft className="w-4 h-4 mr-1" />Turmas
              </Link>
            </Button>
            <h1 className="text-xl font-semibold truncate">{klass?.name ?? "—"}</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" />Nova supervisão</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nova supervisão</DialogTitle>
                <DialogDescription>Defina data, vagas e detalhes do encontro.</DialogDescription>
              </DialogHeader>
              <SupervisionForm
                submitLabel="Criar supervisão"
                onSubmit={async (v) => {
                  try {
                    await createSupervision({
                      class_id: classId,
                      title: v.title.trim(),
                      description: v.description.trim() || undefined,
                      location: v.location.trim() || undefined,
                      starts_at: new Date(v.starts_at).toISOString(),
                      duration_minutes: v.duration_minutes,
                      max_students: v.max_students,
                    });
                    toast.success("Supervisão criada");
                    setOpen(false);
                    qc.invalidateQueries({ queryKey: ["sups-by-class", classId] });
                  } catch (e: any) {
                    toast.error(e?.message ?? "Erro");
                  }
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma supervisão criada nesta turma ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {items.map((s) => {
              const isPast = new Date(s.starts_at) < new Date();
              return (
                <Card key={s.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-4">
                    <div className="min-w-0">
                      <CardTitle className="text-lg">{s.title}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {format(new Date(s.starts_at), "PPPp", { locale: ptBR })} · {s.duration_minutes}min
                      </p>
                      <p className="text-sm mt-1">
                        <span className="font-medium">{s.max_students - s.taken}</span>
                        <span className="text-muted-foreground"> vagas disponíveis de {s.max_students}</span>
                        <span className="text-muted-foreground"> · {s.taken} inscrito{s.taken === 1 ? "" : "s"}</span>
                      </p>
                      {s.location && <p className="text-sm mt-1 truncate">{s.location}</p>}
                    </div>
                    {isPast && <Badge variant="secondary">Realizada</Badge>}
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => copyLink(s.slug)}>
                      <Copy className="w-4 h-4 mr-1" />Copiar link
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link to="/admin/supervisions/$id" params={{ id: s.id }}>
                        <Pencil className="w-4 h-4 mr-1" />Detalhes
                      </Link>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}