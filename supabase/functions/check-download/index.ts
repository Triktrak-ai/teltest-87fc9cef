import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate API key
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("REPORT_API_KEY");
  if (!expectedKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const imei = url.searchParams.get("imei");

  if (!imei) {
    return new Response(JSON.stringify({ error: "imei parameter required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    console.log(`check-download called for IMEI=${imei}`);

    // Check if download block is globally disabled (dev mode)
    const { data: settingData, error: settingError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "download_block_disabled")
      .maybeSingle();

    console.log(`dev mode setting: value=${settingData?.value}, error=${settingError?.message ?? 'none'}`);

    if (settingData?.value === "true") {
      console.log(`Dev mode ON — allowing download for ${imei}`);
      return new Response(JSON.stringify({ should_download: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase
      .from("download_schedule")
      .select("last_success_at, status")
      .eq("imei", imei)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return new Response(JSON.stringify({ should_download: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!data || data.status !== "ok" || !data.last_success_at) {
      console.log(`No block: data=${JSON.stringify(data)} → allowing`);
      return new Response(JSON.stringify({ should_download: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if last_success_at is today (UTC)
    const lastSuccess = new Date(data.last_success_at);
    const now = new Date();
    const isToday =
      lastSuccess.getUTCFullYear() === now.getUTCFullYear() &&
      lastSuccess.getUTCMonth() === now.getUTCMonth() &&
      lastSuccess.getUTCDate() === now.getUTCDate();

    console.log(`Schedule check: status=${data.status}, lastSuccess=${data.last_success_at}, isToday=${isToday}, should_download=${!isToday}`);

    return new Response(
      JSON.stringify({ should_download: !isToday }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ should_download: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
