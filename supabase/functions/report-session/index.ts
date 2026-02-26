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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();

    // Validate required fields
    if (!body.session_id || !body.imei) {
      return new Response(
        JSON.stringify({ error: "session_id and imei are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Upsert session
    const sessionData: Record<string, unknown> = {
      id: body.session_id,
      imei: body.imei,
      status: body.status ?? "connecting",
      last_activity: new Date().toISOString(),
    };

    // Optional fields
    if (body.vehicle_plate !== undefined)
      sessionData.vehicle_plate = body.vehicle_plate;
    if (body.generation !== undefined)
      sessionData.generation = body.generation;
    if (body.progress !== undefined) sessionData.progress = body.progress;
    if (body.files_downloaded !== undefined)
      sessionData.files_downloaded = body.files_downloaded;
    if (body.total_files !== undefined)
      sessionData.total_files = body.total_files;
    if (body.current_file !== undefined)
      sessionData.current_file = body.current_file;
    if (body.error_code !== undefined)
      sessionData.error_code = body.error_code;
    if (body.error_message !== undefined)
      sessionData.error_message = body.error_message;
    if (body.bytes_downloaded !== undefined)
      sessionData.bytes_downloaded = body.bytes_downloaded;
    if (body.apdu_exchanges !== undefined)
      sessionData.apdu_exchanges = body.apdu_exchanges;
    if (body.crc_errors !== undefined)
      sessionData.crc_errors = body.crc_errors;

    // Set completed_at when status is completed
    if (body.status === "completed") {
      sessionData.completed_at = new Date().toISOString();
    }

    const { error: sessionError } = await supabase
      .from("sessions")
      .upsert(sessionData, { onConflict: "id" });

    if (sessionError) {
      console.error("Session upsert error:", sessionError);
      return new Response(
        JSON.stringify({ error: "Failed to upsert session", details: sessionError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert event if present
    if (body.event) {
      const { error: eventError } = await supabase
        .from("session_events")
        .insert({
          session_id: body.session_id,
          imei: body.imei,
          type: body.event.type ?? "info",
          message: body.event.message,
          context: body.event.context ?? null,
        });

      if (eventError) {
        console.error("Event insert error:", eventError);
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
