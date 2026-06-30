import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Supervisões de Pós-Graduação" },
      { name: "description", content: "Sistema para agendar e confirmar presença em supervisões de pós-graduação." },
      { property: "og:title", content: "Supervisões de Pós-Graduação" },
      { property: "og:description", content: "Sistema para agendar e confirmar presença em supervisões." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Supervisões de Pós-Graduação
        </h1>
        <p className="text-lg text-muted-foreground">
          Os alunos confirmam presença pelo link personalizado da turma enviado pelo professor.
          Professores acessam o painel para criar e gerenciar as supervisões.
        </p>
        <div className="flex justify-center gap-3">
          <Button asChild>
            <Link to="/auth">Acesso do professor</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
