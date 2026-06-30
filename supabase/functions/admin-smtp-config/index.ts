import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.15";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type SmtpPayload = {
  action?: "get" | "save" | "test";
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  from_email?: string;
  from_name?: string | null;
  use_tls?: boolean;
  to?: string;
};

type FullSmtpConfig = {
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
};

Deno.serve(async (req: Request) => {
  console.log("=== Iniciando função admin-smtp-config ===");
  if (req.method === "OPTIONS") {
    console.log("Resposta OPTIONS");
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

    console.log("supabaseUrl:", !!supabaseUrl);
    console.log("supabaseAnonKey:", !!supabaseAnonKey);
    console.log("supabaseServiceRoleKey:", !!supabaseServiceRoleKey);
    console.log("authHeader:", !!authHeader);

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Variaveis do Supabase ausentes na Edge Function." }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Token de autenticacao ausente." }),
        { status: 401, headers: corsHeaders },
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });

    console.log("Chamando userClient.auth.getUser()...");
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    console.log("auth.getUser() resultado:", { hasUser: !!user, authError });

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario nao autenticado." }),
        { status: 401, headers: corsHeaders },
      );
    }

    console.log("Chamando has_role RPC...");
    const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    console.log("has_role resultado:", { isAdmin, roleError });

    if (roleError) {
      return new Response(
        JSON.stringify({ error: "Nao foi possivel validar as permissoes do usuario: " + roleError.message }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem acessar a configuracao SMTP." }),
        { status: 403, headers: corsHeaders },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: SmtpPayload | null = null;
    if (req.method === "POST") {
      body = (await req.json()) as SmtpPayload;
      console.log("Body recebido:", body);
    }

    if (req.method === "GET" || body?.action === "get") {
      console.log("Ação: get");
      const { data, error } = await adminClient
        .from("smtp_config")
        .select("*")
        .limit(1)
        .maybeSingle();

      console.log("smtp_config get resultado:", { data, error });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, config: data ?? null }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Metodo nao suportado." }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    if (body?.action === "test") {
      console.log("Ação: test");
      const to = body.to?.trim().toLowerCase();
      if (!to) {
        return new Response(
          JSON.stringify({ error: "E-mail de destino para o teste e obrigatorio." }),
          { status: 400, headers: corsHeaders },
        );
      }

      let config: FullSmtpConfig | null;
      if (body.host && body.username && body.password && body.from_email) {
        config = {
          id: "temp",
          host: body.host.trim(),
          port: Number(body.port ?? 587),
          username: body.username.trim(),
          password: body.password.trim(),
          from_email: body.from_email.trim().toLowerCase(),
          from_name: body.from_name?.trim() || null,
          use_tls: body.use_tls ?? true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      } else {
        const { data, error } = await adminClient
          .from("smtp_config")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400, headers: corsHeaders,
          });
        }
        if (!data) {
          return new Response(
            JSON.stringify({ error: "Nenhuma configuracao SMTP salva. Salve primeiro ou preencha todos os campos para testar." }),
            { status: 400, headers: corsHeaders },
          );
        }
        config = data as FullSmtpConfig;
      }

      console.log("Criando transporter nodemailer...");
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465,
        requireTLS: config.use_tls && config.port !== 465,
        auth: {
          user: config.username,
          pass: config.password,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      console.log("Verificando conexão SMTP...");
      await transporter.verify();

      const from = config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email;
      console.log("Enviando e-mail...");
      await transporter.sendMail({
        from,
        to,
        subject: "Teste de envio SMTP - Painel Administrativo",
        text: `Olá!

Este é um e-mail de teste enviado pelo painel administrativo.

Se você recebeu essa mensagem, significa que a configuração SMTP está funcionando corretamente!

Atenciosamente,
Equipe do Sistema`,
        html: `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
    h1 { color: #dc2626; }
    .success { padding: 12px; background: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Teste de Envio SMTP</h1>
  <div class="success">
    <p>Olá!</p>
    <p>Este é um e-mail de teste enviado pelo painel administrativo.</p>
    <p>Se você recebeu essa mensagem, significa que a configuração SMTP está <strong>funcionando corretamente</strong>!</p>
  </div>
  <p>Atenciosamente,<br>Equipe do Sistema</p>
</body>
</html>`});

      console.log("E-mail enviado com sucesso!");
      return new Response(JSON.stringify({ success: true, message: "E-mail de teste enviado com sucesso!" }), {
        status: 200, headers: corsHeaders,
      });
    }

    console.log("Ação: save");
    const payload = {
      host: body.host?.trim(),
      port: Number(body.port ?? 587),
      username: body.username?.trim(),
      password: body.password?.trim(),
      from_email: body.from_email?.trim().toLowerCase(),
      from_name: body.from_name?.trim() || null,
      use_tls: body.use_tls ?? true,
    };

    if (!payload.host || !payload.username || !payload.password || !payload.from_email) {
      return new Response(
        JSON.stringify({ error: "Host, usuario, senha e e-mail remetente sao obrigatorios." }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: existing, error: readError } = await adminClient
      .from("smtp_config")
      .select("id")
      .limit(1)
      .maybeSingle();

    console.log("Verificando configuração existente:", { existing, readError });

    if (readError) {
      return new Response(JSON.stringify({ error: readError.message }), {
        status: 400, headers: corsHeaders,
      });
    }

    if (existing?.id) {
      const { data, error } = await adminClient
        .from("smtp_config")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();

      console.log("Update resultado:", { data, error });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: corsHeaders,
        });
      }

      return new Response(JSON.stringify({ success: true, config: data }), {
        status: 200, headers: corsHeaders,
      });
    }

    console.log("Inserindo nova configuração...");
    const { data, error } = await adminClient
      .from("smtp_config")
      .insert(payload)
      .select("*")
      .single();

    console.log("Insert resultado:", { data, error });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true, config: data }), {
      status: 200, headers: corsHeaders,
    });
  } catch (error) {
    console.error("=== ERRO NA FUNÇÃO ===");
    console.error(error);
    const message = error instanceof Error ? error.message : "Erro interno ao salvar SMTP.";
    const stack = error instanceof Error ? error.stack : undefined;
    return new Response(JSON.stringify({ error: message, stack }), {
      status: 500, headers: corsHeaders,
    });
  }
});
