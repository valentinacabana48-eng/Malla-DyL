import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

serve(async (req) => {
  if (req?.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  try {
    const { email, code } = await req?.json();

    const RESEND_API_KEY = (globalThis as any)?.Deno?.env?.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "onboarding@resend.dev",
        to: [email],
        subject: "Código de recuperación de PIN — D&L Gestor",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px;">
            <h2 style="color: #0f2744; margin-bottom: 8px;">D&L Gestor</h2>
            <p style="color: #475569; margin-bottom: 24px;">Recibiste este correo porque solicitaste restablecer tu PIN de acceso.</p>
            <div style="background: #fff; border: 2px solid #e2e8f0; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <p style="color: #64748b; font-size: 13px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Tu código de recuperación</p>
              <p style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1d5bd4; margin: 0;">${code}</p>
            </div>
            <p style="color: #94a3b8; font-size: 12px;">Este código es válido por 15 minutos. Si no solicitaste este código, ignora este correo.</p>
          </div>
        `,
      }),
    });

    if (!res?.ok) {
      const err = await res?.text();
      throw new Error(`Resend error: ${err}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
