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
    console.log("INCOMING PAYLOAD keys:", Object.keys(body), "card_generation:", body.card_generation, "session_id:", body.session_id);

    // Validate required fields
    if (!body.session_id) {
      return new Response(
        JSON.stringify({ error: "session_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fallback IMEI to "unknown" if not provided
    if (!body.imei) {
      body.imei = "unknown";
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
    if (body.card_generation !== undefined)
      sessionData.card_generation = body.card_generation;

    // Set completed_at when status is completed
    if (body.status === "completed") {
      sessionData.completed_at = new Date().toISOString();
    }

    console.log("UPSERT sessionData:", JSON.stringify(sessionData));

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

    // Upsert download_schedule based on session status
    const sessionStatus = body.status;
    if (sessionStatus === "completed" || sessionStatus === "error" || sessionStatus === "skipped") {
      const scheduleData: Record<string, unknown> = {
        imei: body.imei,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (sessionStatus === "completed") {
        scheduleData.status = "ok";
        scheduleData.last_success_at = new Date().toISOString();
        scheduleData.last_error = null;
      } else if (sessionStatus === "error") {
        scheduleData.status = "error";
        scheduleData.last_error = body.error_message ?? "Unknown error";
      } else if (sessionStatus === "skipped") {
        scheduleData.status = "skipped";
      }

      const { error: schedError } = await supabase
        .from("download_schedule")
        .upsert(scheduleData, { onConflict: "imei" });

      if (schedError) {
        console.error("Schedule upsert error:", schedError);
      }

      // Increment attempts_today via raw update after upsert
      if (sessionStatus === "skipped") {
        await supabase.rpc("increment_attempts_today", { p_imei: body.imei }).catch(() => {
          // Fallback: just log, non-critical
          console.warn("Could not increment attempts_today");
        });
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
