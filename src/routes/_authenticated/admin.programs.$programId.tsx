import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getProgram, listClasses, createClass, deleteClass } from "@/lib/supervisions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ArrowLeft, ChevronRight, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/programs/$programId")({
  head: () => ({ meta: [{ title: "Turmas" }] }),
  component: ProgramPage,
});

function ProgramPage() {
  const { programId } = Route.useParams();
  const qc = useQueryClient();
  const { data: program } = useQuery({ queryKey: ["program", programId], queryFn: () => getProgram(programId) });
  const { data: classes = [], isLoading } = useQuery({
    queryKey: ["classes", programId],
    queryFn: () => listClasses(programId),
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createClass({ program_id: programId, name: name.trim(), description: description.trim() || undefined });
      toast.success("Turma criada");
      setName(""); setDescription(""); setOpen(false);
      qc.invalidateQueries({ queryKey: ["classes", programId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setSaving(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta turma? Todas as supervisões serão removidas.")) return;
    try {
      await deleteClass(id);
      toast.success("Turma excluída");
      qc.invalidateQueries({ queryKey: ["classes", programId] });
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
              <Link to="/admin"><ArrowLeft className="w-4 h-4 mr-1" />Pós-graduações</Link>
            </Button>
            <h1 className="text-xl font-semibold truncate">{program?.name ?? "—"}</h1>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-1" />Nova turma</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova turma</DialogTitle>
                <DialogDescription>Ex.: Turma 1, Turma 2024.2, Sábado manhã.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="desc">Descrição</Label>
                  <Textarea id="desc" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : classes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Nenhuma turma cadastrada nesta pós-graduação.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {classes.map((c) => (
              <Card key={c.id} className="hover:border-primary/50 transition-colors">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />{c.name}
                  </CardTitle>
                  {c.description && <CardDescription className="line-clamp-2">{c.description}</CardDescription>}
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/admin/classes/$classId" params={{ classId: c.id }}>
                      Ver supervisões <ChevronRight className="w-4 h-4 ml-1" />
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}