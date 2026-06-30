import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listPrograms,
  createProgram,
  deleteProgram,
  getSmtpConfig,
  saveSmtpConfig,
  testSmtp,
  listUsers,
  type SmtpConfig,
  type AdminUser,
} from "@/lib/supervisions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { GraduationCap, Plus, Trash2, LogOut, ChevronRight, Users, Mail, UserPlus, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Painel Administrativo" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: items = [], isLoading: loadingPrograms } = useQuery({
    queryKey: ["programs"],
    queryFn: listPrograms,
  });
  const { data: smtpConfig, isLoading: loadingSmtp } = useQuery({
    queryKey: ["smtpConfig"],
    queryFn: getSmtpConfig,
  });
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: listUsers,
  });

  // Program dialog state
  const [openProgram, setOpenProgram] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [savingProgram, setSavingProgram] = useState(false);

  // User dialog state
  const [openUser, setOpenUser] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [userName, setUserName] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  // SMTP form state
  const [smtpForm, setSmtpForm] = useState<Partial<SmtpConfig>>({
    host: "",
    port: 587,
    username: "",
    password: "",
    from_email: "",
    from_name: "",
    use_tls: true,
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Initialize SMTP form when data loads
  useEffect(() => {
    if (smtpConfig) {
      setSmtpForm(smtpConfig);
    }
  }, [smtpConfig]);

  function formatDateTime(value: string | null | undefined) {
    if (!value) return "Nunca";
    return new Date(value).toLocaleString("pt-BR");
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function handleCreateProgram(e: React.FormEvent) {
    e.preventDefault();
    setSavingProgram(true);
    try {
      await createProgram({ name: name.trim(), description: description.trim() || undefined });
      toast.success("Pós-graduação criada");
      setName(""); setDescription(""); setOpenProgram(false);
      qc.invalidateQueries({ queryKey: ["programs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally { setSavingProgram(false); }
  }

  async function handleDeleteProgram(id: string) {
    if (!confirm("Excluir esta pós-graduação? Todas as turmas e supervisões serão removidas.")) return;
    try {
      await deleteProgram(id);
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["programs"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    }
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setSavingUser(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          email: userEmail,
          password: userPassword,
          name: userName,
        },
      });

      if (error) {
        let message = error.message || "Erro ao criar usuario";
        const response = (error as { context?: Response }).context;

        if (response instanceof Response) {
          const payload = await response.json().catch(() => null);
          if (payload && typeof payload === "object" && "error" in payload) {
            message = String(payload.error);
          }
        }

        throw new Error(message);
      }

      if (!data?.success) {
        throw new Error("Nao foi possivel criar o usuario.");
      }

      toast.success("Usuario criado com sucesso!");
      setUserEmail("");
      setUserPassword("");
      setUserName("");
      setOpenUser(false);
      qc.invalidateQueries({ queryKey: ["adminUsers"] });
    } catch (e: any) {
      const errorMsg = e?.message ?? "Erro ao criar usuario";
      toast.error(errorMsg);
    } finally { setSavingUser(false); }
  }

  async function handleSaveSmtp(e: React.FormEvent) {
    e.preventDefault();
    setSavingSmtp(true);
    try {
      await saveSmtpConfig(smtpForm);
      toast.success("Configuração SMTP salva!");
      qc.invalidateQueries({ queryKey: ["smtpConfig"] });
    } catch (e: any) {
      let errorMsg = e?.message ?? "Erro ao salvar configuração SMTP";
      if (errorMsg.includes("smtp_config")) {
        errorMsg = "A tabela smtp_config não existe! Por favor, aplique a migração SQL primeiro.";
      }
      toast.error(errorMsg);
    } finally { setSavingSmtp(false); }
  }

  async function handleTestEmail() {
    if (!testEmail.trim()) {
      toast.error("Informe um e-mail de destino para o teste!");
      return;
    }
    setSendingTestEmail(true);
    try {
      const result = await testSmtp({ ...smtpForm, to: testEmail.trim() });
      toast.success(result);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar e-mail de teste");
    } finally {
      setSendingTestEmail(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <GraduationCap className="w-5 h-5" /> Painel Administrativo
          </h1>
          <Button variant="ghost" onClick={handleSignOut}><LogOut className="w-4 h-4" /></Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="programs" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="programs" className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4" /> Pós-graduações
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Usuários
            </TabsTrigger>
            <TabsTrigger value="smtp" className="flex items-center gap-2">
              <Mail className="w-4 h-4" /> Configuração SMTP
            </TabsTrigger>
          </TabsList>

          {/* Programs Tab */}
          <TabsContent value="programs">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Pós-graduações</h2>
              <Dialog open={openProgram} onOpenChange={setOpenProgram}>
                <DialogTrigger asChild>
                  <Button><Plus className="w-4 h-4 mr-1" />Nova pós-graduação</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova pós-graduação</DialogTitle>
                    <DialogDescription>Ex.: Neuropsicologia, Psicanálise, Direito Tributário.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateProgram} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome *</Label>
                      <Input id="name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="desc">Descrição</Label>
                      <Textarea id="desc" maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={savingProgram}>{savingProgram ? "Salvando…" : "Criar"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {loadingPrograms ? (
              <p className="text-muted-foreground">Carregando…</p>
            ) : items.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Nenhuma pós-graduação cadastrada. Crie a primeira para começar.
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {items.map((p) => (
                  <Card key={p.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader>
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      {p.description && <CardDescription className="line-clamp-2">{p.description}</CardDescription>}
                    </CardHeader>
                    <CardContent className="flex items-center justify-between">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/admin/programs/$programId" params={{ programId: p.id }}>
                          Ver turmas <ChevronRight className="w-4 h-4 ml-1" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteProgram(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Usuários</h2>
              <Dialog open={openUser} onOpenChange={setOpenUser}>
                <DialogTrigger asChild>
                  <Button><UserPlus className="w-4 h-4 mr-1" />Novo Usuário</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Usuário</DialogTitle>
                    <DialogDescription>Crie um novo usuário administrador ou professor. O e-mail será confirmado automaticamente.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="userName">Nome *</Label>
                      <Input id="userName" required maxLength={120} value={userName} onChange={(e) => setUserName(e.target.value)} placeholder="Nome do usuário" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userEmail">E-mail *</Label>
                      <Input id="userEmail" type="email" required value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="usuario@exemplo.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="userPassword">Senha * (mínimo 6 caracteres)</Label>
                      <Input id="userPassword" type="password" required minLength={6} value={userPassword} onChange={(e) => setUserPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={savingUser}>{savingUser ? "Criando…" : "Criar Usuário"}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usuários cadastrados</CardTitle>
                <CardDescription>Lista de acessos já criados no Supabase Auth.</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingUsers ? (
                  <p className="text-muted-foreground">Carregando usuários…</p>
                ) : users.length === 0 ? (
                  <p className="text-muted-foreground">Nenhum usuário encontrado.</p>
                ) : (
                  <div className="space-y-3">
                    {users.map((user: AdminUser) => (
                      <div key={user.id} className="rounded-lg border p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                          <div className="space-y-1">
                            <p className="font-medium">{user.name || "Sem nome"}</p>
                            <p className="text-sm text-muted-foreground">{user.email || "Sem e-mail"}</p>
                            <div className="flex flex-wrap gap-2 pt-1">
                              {user.roles.length > 0 ? user.roles.map((role) => (
                                <span
                                  key={`${user.id}-${role}`}
                                  className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                                >
                                  {role}
                                </span>
                              )) : (
                                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                                  sem papel
                                </span>
                              )}
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${user.email_confirmed_at ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                {user.email_confirmed_at ? "confirmado" : "pendente"}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1 text-sm text-muted-foreground md:text-right">
                            <p>Criado em: {formatDateTime(user.created_at)}</p>
                            <p>Último acesso: {formatDateTime(user.last_sign_in_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMTP Tab */}
          <TabsContent value="smtp">
            <div className="mb-6">
              <h2 className="text-lg font-semibold">Configuração SMTP</h2>
              <p className="text-muted-foreground text-sm mt-1">Configure o servidor de e-mail para envio de lembretes.</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Dados do Servidor SMTP
                </CardTitle>
                <CardDescription>
                  Esta seção usa a Edge Function <code className="bg-background px-1.5 py-0.5 rounded">admin-smtp-config</code> no Supabase.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSmtp} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="smtpHost">Host *</Label>
                      <Input id="smtpHost" required value={smtpForm.host || ""} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} placeholder="smtp.example.com" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPort">Porta *</Label>
                      <Input id="smtpPort" type="number" required value={smtpForm.port || 587} onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) || 587 })} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="smtpUsername">Usuário *</Label>
                      <Input id="smtpUsername" required value={smtpForm.username || ""} onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpPassword">Senha *</Label>
                      <Input id="smtpPassword" type="password" required value={smtpForm.password || ""} onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="smtpFromEmail">E-mail Remetente *</Label>
                      <Input id="smtpFromEmail" type="email" required value={smtpForm.from_email || ""} onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtpFromName">Nome Remetente</Label>
                      <Input id="smtpFromName" value={smtpForm.from_name || ""} onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch id="useTls" checked={smtpForm.use_tls || true} onCheckedChange={(checked) => setSmtpForm({ ...smtpForm, use_tls: checked })} />
                    <Label htmlFor="useTls">Usar TLS/SSL</Label>
                  </div>
                  <div className="pt-4 border-t">
                    <h3 className="text-sm font-medium mb-3">Testar Configuração</h3>
                    <div className="flex gap-3">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="testEmail">E-mail de destino *</Label>
                        <Input
                          id="testEmail"
                          type="email"
                          value={testEmail}
                          onChange={(e) => setTestEmail(e.target.value)}
                          placeholder="seu-email@exemplo.com"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button
                          variant="outline"
                          onClick={handleTestEmail}
                          disabled={sendingTestEmail || loadingSmtp}
                        >
                          {sendingTestEmail ? "Enviando…" : "Enviar E-mail de Teste"}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="pt-4">
                    <Button type="submit" disabled={savingSmtp || loadingSmtp}>
                      {savingSmtp ? "Salvando…" : "Salvar Configuração"}
                    </Button>
                    {smtpConfig && (
                      <div className="flex items-center gap-2 mt-3 text-sm text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Configuração salva</span>
                      </div>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
