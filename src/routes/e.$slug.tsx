import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getSupervisionBySlug, registerStudent } from "@/lib/supervisions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/e/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "Confirmar presença" }] }),
  component: PublicPage,
});

function PublicPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["sup-public", slug],
    queryFn: () => getSupervisionBySlug(slug),
  });
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-foreground">Carregando…</div>
    </div>
  );
  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full border-border shadow-xl">
          <CardHeader>
            <CardTitle className="text-foreground">Supervisão não encontrada</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            O link informado não é válido.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPast = new Date(data.starts_at) < new Date();
  const isFull = data.taken >= data.max_students;
  const seatsLeft = Math.max(0, data.max_students - data.taken);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    const first = form.first_name.trim();
    const last = form.last_name.trim();
    const email = form.email.trim();
    if (!first || !last || !email) return toast.error("Preencha todos os campos");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast.error("E-mail inválido");
    setSubmitting(true);
    try {
      await registerStudent(data.id, { first_name: first, last_name: last, email });
      setConfirmed(true);
      qc.invalidateQueries({ queryKey: ["sup-public", slug] });
    } catch (e: any) {
      const msg = e?.message ?? "Erro";
      if (msg.includes("uniq_reg_active_email")) toast.error("Este e-mail já confirmou presença.");
      else if (msg.includes("row-level security") || msg.includes("violates")) toast.error("Não há mais vagas disponíveis.");
      else toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-foreground">
      {/* Header com logo */}
      <header className="px-4 py-8">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img 
            src="/images/logo.png" 
            alt="Sapiens Instituto de Psicologia" 
            className="h-20 md:h-24 object-contain"
          />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pb-12">
        <div className="space-y-8">
          {/* Card da Supervisão */}
          <Card className="border-0 bg-white shadow-2xl overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-primary via-red-500 to-primary"></div>
            <CardHeader className="pb-6 pt-8">
              {(data as any).program_name && (
                <div className="inline-block mb-4">
                  <Badge className="bg-primary/10 text-primary hover:bg-primary/20 px-4 py-1.5 text-sm font-medium">
                    {(data as any).program_name}{(data as any).class_name ? ` · ${(data as any).class_name}` : ""}
                  </Badge>
                </div>
              )}
              <CardTitle className="text-3xl md:text-4xl font-bold text-slate-900 mb-3">{data.title}</CardTitle>
              {data.description && <CardDescription className="text-slate-600 text-lg leading-relaxed whitespace-pre-wrap">{data.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-6 pb-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1 font-medium">Data e Horário</p>
                    <p className="text-slate-900 font-semibold">{format(new Date(data.starts_at), "PPPp", { locale: ptBR })}</p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1 font-medium">Duração</p>
                    <p className="text-slate-900 font-semibold">{data.duration_minutes} minutos</p>
                  </div>
                </div>
                {data.location && (
                  <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-slate-500 mb-1 font-medium">Local</p>
                      <p className="text-slate-900 font-semibold">{data.location}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-4 p-5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 mb-1 font-medium">Vagas</p>
                    <p className="font-semibold">
                      {isFull ? <span className="text-destructive">Vagas esgotadas</span> : <span className="text-slate-900">{seatsLeft} de {data.max_students} disponíveis</span>}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card de Confirmação */}
          {confirmed ? (
            <Card className="border-0 bg-white shadow-2xl overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-green-500 via-emerald-500 to-green-500"></div>
              <CardContent className="py-16 text-center space-y-8">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-12 h-12 text-green-600" />
                </div>
                <div className="space-y-3">
                  <h2 className="text-3xl font-bold text-slate-900">Presença confirmada!</h2>
                  <p className="text-slate-600 text-lg max-w-lg mx-auto leading-relaxed">
                    Você receberá lembretes por e-mail 5 dias, 1 dia e 1 hora antes da supervisão.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : isPast ? (
            <Card className="border-0 bg-white shadow-2xl overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-slate-400 via-slate-500 to-slate-400"></div>
              <CardContent className="py-14 text-center">
                <div className="space-y-2">
                  <Clock className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-xl text-slate-600 font-medium">Esta supervisão já ocorreu.</p>
                </div>
              </CardContent>
            </Card>
          ) : isFull ? (
            <Card className="border-0 bg-white shadow-2xl overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500"></div>
              <CardContent className="py-14 text-center">
                <div className="space-y-2">
                  <Users className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                  <p className="text-xl text-slate-600 font-medium">Todas as vagas foram preenchidas.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 bg-white shadow-2xl overflow-hidden">
              <div className="h-2 bg-gradient-to-r from-primary via-red-500 to-primary"></div>
              <CardHeader className="pb-6 pt-8">
                <CardTitle className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <ArrowRight className="w-4 h-4 text-white" />
                  </div>
                  Confirmar minha presença
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-8">
                <form onSubmit={onSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2.5">
                      <Label htmlFor="first" className="text-slate-700 font-semibold text-sm">Nome *</Label>
                      <Input 
                        id="first" 
                        required 
                        maxLength={80} 
                        value={form.first_name}
                        onChange={(e) => setForm({ ...form, first_name: e.target.value })} 
                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="Seu nome"
                      />
                    </div>
                    <div className="space-y-2.5">
                      <Label htmlFor="last" className="text-slate-700 font-semibold text-sm">Sobrenome *</Label>
                      <Input 
                        id="last" 
                        required 
                        maxLength={80} 
                        value={form.last_name}
                        onChange={(e) => setForm({ ...form, last_name: e.target.value })} 
                        className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                        placeholder="Seu sobrenome"
                      />
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    <Label htmlFor="email" className="text-slate-700 font-semibold text-sm">E-mail *</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      required 
                      maxLength={255} 
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} 
                      className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 h-12 focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                      placeholder="seu@email.com"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-primary hover:bg-primary/90 text-white py-7 text-lg font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 transition-all rounded-xl mt-2"
                    disabled={submitting}
                  >
                    {submitting ? "Confirmando…" : "Confirmar minha vaga"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <footer className="mt-16 pb-10 text-center">
          <div className="h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent mb-8"></div>
          <p className="text-slate-500 text-sm">© 2024 Sapiens Instituto de Psicologia. Todos os direitos reservados.</p>
        </footer>
      </div>
    </div>
  );
}