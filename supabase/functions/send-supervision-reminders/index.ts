import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.15";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const LOOKBACK_MS = 5 * 60 * 1000;

const REMINDER_WINDOWS = [
  {
    type: "5d",
    label: "5 dias",
    subjectPrefix: "Lembrete de supervisao - 5 dias",
    offsetMs: 5 * 24 * 60 * 60 * 1000,
  },
  {
    type: "1d",
    label: "1 dia",
    subjectPrefix: "Lembrete de supervisao - 1 dia",
    offsetMs: 24 * 60 * 60 * 1000,
  },
  {
    type: "1h",
    label: "1 hora",
    subjectPrefix: "Lembrete de supervisao - 1 hora",
    offsetMs: 60 * 60 * 1000,
  },
] as const;

type ReminderType = (typeof REMINDER_WINDOWS)[number]["type"];

type SmtpConfigRow = {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string | null;
  use_tls: boolean;
};

type RegistrationRow = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  canceled_at: string | null;
  supervision: {
    id: string;
    title: string;
    starts_at: string;
    duration_minutes: number;
    location: string | null;
    slug: string;
  } | null;
};

type PendingReminder = {
  registration: RegistrationRow;
  reminderType: ReminderType;
  reminderLabel: string;
  subjectPrefix: string;
};

function formatStartsAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

function buildEmailHtml(params: {
  participantName: string;
  supervisionTitle: string;
  startsAt: string;
  reminderLabel: string;
  location: string | null;
}) {
  const locationBlock = params.location
    ? `<p><strong>Local / link:</strong> ${params.location}</p>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #1f2937; }
    .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; max-width: 640px; }
    .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 6px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
    h1 { color: #111827; margin-bottom: 8px; }
    p { line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">Lembrete ${params.reminderLabel}</span>
    <h1>${params.supervisionTitle}</h1>
    <p>Ola, ${params.participantName}!</p>
    <p>Este e um lembrete de que sua supervisao esta marcada para <strong>${params.startsAt}</strong>.</p>
    ${locationBlock}
    <p>Se precisar, acesse o painel ou entre em contato com a equipe responsavel.</p>
    <p>Atenciosamente,<br />Equipe do Sistema</p>
  </div>
</body>
</html>`;
}

function buildEmailText(params: {
  participantName: string;
  supervisionTitle: string;
  startsAt: string;
  reminderLabel: string;
  location: string | null;
}) {
  const locationLine = params.location ? `Local / link: ${params.location}\n` : "";

  return [
    `Ola, ${params.participantName}!`,
    "",
    `Este e um lembrete de ${params.reminderLabel} para a supervisao "${params.supervisionTitle}".`,
    `Data e hora: ${params.startsAt}`,
    locationLine.trimEnd(),
    "",
    "Atenciosamente,",
    "Equipe do Sistema",
  ]
    .filter(Boolean)
    .join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Metodo nao suportado." }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Variaveis do Supabase ausentes na Edge Function." }),
        { status: 500, headers: corsHeaders },
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: smtpConfig, error: smtpError } = await adminClient
      .from("smtp_config")
      .select("host, port, username, password, from_email, from_name, use_tls")
      .limit(1)
      .maybeSingle();

    if (smtpError) {
      throw new Error(`Erro ao carregar smtp_config: ${smtpError.message}`);
    }

    if (!smtpConfig) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhuma configuracao SMTP encontrada." }),
        { status: 200, headers: corsHeaders },
      );
    }

    const { data: registrations, error: registrationsError } = await adminClient
      .from("supervision_registrations")
      .select(`
        id,
        email,
        first_name,
        last_name,
        canceled_at,
        supervision:supervisions!supervision_registrations_supervision_id_fkey (
          id,
          title,
          starts_at,
          duration_minutes,
          location,
          slug
        )
      `)
      .is("canceled_at", null);

    if (registrationsError) {
      throw new Error(`Erro ao carregar inscritos: ${registrationsError.message}`);
    }

    const nowMs = Date.now();
    const windowStartMs = nowMs - LOOKBACK_MS;
    const maxReminderOffsetMs = REMINDER_WINDOWS[0].offsetMs;

    const candidateRegistrations = ((registrations ?? []) as RegistrationRow[]).filter((row) => {
      if (!row.supervision) return false;
      const startsAtMs = new Date(row.supervision.starts_at).getTime();
      return startsAtMs > nowMs && startsAtMs <= nowMs + maxReminderOffsetMs + LOOKBACK_MS;
    });

    if (candidateRegistrations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum lembrete pendente.", processed: 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    const registrationIds = candidateRegistrations.map((row) => row.id);

    const { data: existingLogs, error: logsError } = await adminClient
      .from("reminder_log")
      .select("registration_id, reminder_type")
      .in("registration_id", registrationIds);

    if (logsError) {
      throw new Error(`Erro ao carregar reminder_log: ${logsError.message}`);
    }

    const sentSet = new Set(
      (existingLogs ?? []).map((item) => `${item.registration_id}:${item.reminder_type}`),
    );

    const pendingReminders: PendingReminder[] = [];

    for (const registration of candidateRegistrations) {
      const startsAtMs = new Date(registration.supervision!.starts_at).getTime();

      for (const window of REMINDER_WINDOWS) {
        const dueAtMs = startsAtMs - window.offsetMs;
        const isDueNow = dueAtMs <= nowMs && dueAtMs > windowStartMs;
        const alreadySent = sentSet.has(`${registration.id}:${window.type}`);

        if (isDueNow && !alreadySent) {
          pendingReminders.push({
            registration,
            reminderType: window.type,
            reminderLabel: window.label,
            subjectPrefix: window.subjectPrefix,
          });
        }
      }
    }

    if (pendingReminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum lembrete dentro da janela atual.", processed: 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.port === 465,
      requireTLS: smtpConfig.use_tls && smtpConfig.port !== 465,
      auth: {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      },
      tls: {
        rejectUnauthorized: false,
      },
    });

    await transporter.verify();

    const from = smtpConfig.from_name
      ? `${smtpConfig.from_name} <${smtpConfig.from_email}>`
      : smtpConfig.from_email;

    const sent: Array<{ registration_id: string; reminder_type: ReminderType; email: string }> = [];
    const failed: Array<{ registration_id: string; reminder_type: ReminderType; email: string; error: string }> = [];

    for (const item of pendingReminders) {
      const participantName =
        `${item.registration.first_name} ${item.registration.last_name}`.trim() || "participante";
      const startsAtFormatted = formatStartsAt(item.registration.supervision!.starts_at);

      try {
        await transporter.sendMail({
          from,
          to: item.registration.email,
          subject: `${item.subjectPrefix}: ${item.registration.supervision!.title}`,
          text: buildEmailText({
            participantName,
            supervisionTitle: item.registration.supervision!.title,
            startsAt: startsAtFormatted,
            reminderLabel: item.reminderLabel,
            location: item.registration.supervision!.location,
          }),
          html: buildEmailHtml({
            participantName,
            supervisionTitle: item.registration.supervision!.title,
            startsAt: startsAtFormatted,
            reminderLabel: item.reminderLabel,
            location: item.registration.supervision!.location,
          }),
        });

        const { error: logInsertError } = await adminClient
          .from("reminder_log")
          .upsert(
            {
              registration_id: item.registration.id,
              reminder_type: item.reminderType,
            },
            {
              onConflict: "registration_id,reminder_type",
              ignoreDuplicates: true,
            },
          );

        if (logInsertError) {
          throw new Error(`E-mail enviado, mas falhou ao registrar log: ${logInsertError.message}`);
        }

        sent.push({
          registration_id: item.registration.id,
          reminder_type: item.reminderType,
          email: item.registration.email,
        });
      } catch (error) {
        failed.push({
          registration_id: item.registration.id,
          reminder_type: item.reminderType,
          email: item.registration.email,
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: failed.length === 0,
        processed: pendingReminders.length,
        sent_count: sent.length,
        failed_count: failed.length,
        sent,
        failed,
      }),
      {
        status: failed.length > 0 ? 207 : 200,
        headers: corsHeaders,
      },
    );
  } catch (error) {
    console.error("Erro ao processar lembretes de supervisao", error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Erro interno ao processar lembretes.",
      }),
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
