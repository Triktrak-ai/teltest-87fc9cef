import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Allow both x-api-key (from C# server) and Authorization bearer (from dashboard)
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("REPORT_API_KEY");
  
  // Also accept apikey header or Authorization bearer from dashboard
  const authHeader = req.headers.get("authorization");
  const apikeyHeader = req.headers.get("apikey");
  
  // Validate: x-api-key for C# server, or supabase client auth for dashboard
  // For dashboard calls, validate the token by creating a supabase client and checking
  let hasValidAuth = !!(expectedKey && apiKey === expectedKey);
  
  if (!hasValidAuth && (apikeyHeader || authHeader)) {
    // Try to validate using Supabase - if the token/apikey can access the DB, it's valid
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const testClient = createClient(supabaseUrl, apikeyHeader || authHeader!.slice(7));
      const { error: testError } = await testClient.from("download_schedule").select("id").limit(1);
      hasValidAuth = !testError;
    } catch {
      hasValidAuth = false;
    }
  }

  if (!hasValidAuth) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { imei, all } = body;

    if (all) {
      // Reset all: set status to pending, clear last_success_at, reset attempts
      const { data, error } = await supabase
        .from("download_schedule")
        .update({
          status: "pending",
          last_success_at: null,
          attempts_today: 0,
          updated_at: new Date().toISOString(),
        })
        .neq("imei", "")
        .select("id");

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, reset_count: data?.length ?? 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (imei) {
      const { data, error } = await supabase
        .from("download_schedule")
        .update({
          status: "pending",
          last_success_at: null,
          attempts_today: 0,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("imei", imei)
        .select("id");

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, reset_count: data?.length ?? 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Provide 'imei' or 'all: true'" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
