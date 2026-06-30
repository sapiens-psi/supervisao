import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

type CreateUserPayload = {
  action?: "list" | "create";
  email?: string;
  password?: string;
  name?: string;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

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

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Usuario nao autenticado." }),
        { status: 401, headers: corsHeaders },
      );
    }

    const { data: isAdmin, error: roleError } = await userClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });

    if (roleError) {
      return new Response(
        JSON.stringify({ error: "Nao foi possivel validar as permissoes do usuario." }),
        { status: 500, headers: corsHeaders },
      );
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Apenas administradores podem criar usuarios." }),
        { status: 403, headers: corsHeaders },
      );
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: CreateUserPayload | null = null;
    if (req.method === "POST") {
      body = (await req.json()) as CreateUserPayload;
    }

    if (req.method === "GET" || body?.action === "list") {
      const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (usersError) {
        return new Response(JSON.stringify({ error: usersError.message }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const userIds = usersData.users.map((item) => item.id);
      const { data: rolesData, error: rolesError } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      if (rolesError) {
        return new Response(JSON.stringify({ error: rolesError.message }), {
          status: 400,
          headers: corsHeaders,
        });
      }

      const rolesByUser = new Map<string, string[]>();
      for (const item of rolesData ?? []) {
        const roles = rolesByUser.get(item.user_id) ?? [];
        roles.push(item.role);
        rolesByUser.set(item.user_id, roles);
      }

      const users = usersData.users.map((item) => ({
        id: item.id,
        email: item.email,
        name: typeof item.user_metadata?.name === "string" ? item.user_metadata.name : null,
        created_at: item.created_at,
        last_sign_in_at: item.last_sign_in_at,
        email_confirmed_at: item.email_confirmed_at,
        roles: rolesByUser.get(item.id) ?? [],
      }));

      return new Response(JSON.stringify({ success: true, users }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const name = body.name?.trim() || null;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: "E-mail e senha sao obrigatorios." }),
        { status: 400, headers: corsHeaders },
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: "A senha deve ter pelo menos 6 caracteres." }),
        { status: 400, headers: corsHeaders },
      );
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      }),
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno ao criar usuario.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
