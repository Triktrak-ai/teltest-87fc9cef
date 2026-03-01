import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const FINAL_STATUSES = ["completed", "partial", "error"];

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

    // === Race condition protection ===
    // Check current session status before upsert
    const { data: existingSession } = await supabase
      .from("sessions")
      .select("status")
      .eq("id", body.session_id)
      .maybeSingle();

    const currentStatus = existingSession?.status;
    const newStatus = body.status;
    const currentIsFinal = currentStatus && FINAL_STATUSES.includes(currentStatus);
    const newIsFinal = newStatus && FINAL_STATUSES.includes(newStatus);

    // If current status is final and new status is NOT final, protect it
    let protectedStatus = false;
    if (currentIsFinal && !newIsFinal) {
      console.log(`STATUS PROTECTION: keeping '${currentStatus}', ignoring '${newStatus}'`);
      protectedStatus = true;
    }

    // Upsert session
    const sessionData: Record<string, unknown> = {
      id: body.session_id,
      imei: body.imei,
      last_activity: new Date().toISOString(),
    };

    // Set status only if not protected
    if (!protectedStatus) {
      sessionData.status = newStatus ?? "connecting";
    }

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

    // Set completed_at when status is completed or partial
    if (!protectedStatus && (newStatus === "completed" || newStatus === "partial")) {
      sessionData.completed_at = new Date().toISOString();
    }

    // === Partial → Completed upgrade ===
    // If incoming status is "partial" and files_downloaded >= 5 (all VU files),
    // check if card issues are only empty_slot → upgrade to completed
    if (!protectedStatus && newStatus === "partial" && (body.files_downloaded ?? 0) >= 5) {
      const { data: events } = await supabase
        .from("session_events")
        .select("message, type")
        .eq("session_id", body.session_id)
        .in("type", ["warning", "error"]);

      const cardIssues = (events ?? []).filter(
        (e) => e.message && (e.message.includes("Slot 1") || e.message.includes("Slot 2") || e.message.includes("card"))
      );
      const allEmptySlot = cardIssues.length > 0 && cardIssues.every(
        (e) => e.message.includes("empty_slot") || e.message.includes("Empty slot")
      );

      if (cardIssues.length === 0 || allEmptySlot) {
        console.log("UPGRADE partial → completed (all VU files downloaded, cards empty_slot)");
        sessionData.status = "completed";
      }
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
    // Use the effective status (after potential upgrade)
    const effectiveStatus = (sessionData.status as string) ?? currentStatus;
    if (effectiveStatus === "completed" || effectiveStatus === "partial" || effectiveStatus === "error" || effectiveStatus === "skipped") {
      const scheduleData: Record<string, unknown> = {
        imei: body.imei,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (effectiveStatus === "completed") {
        scheduleData.status = "ok";
        scheduleData.last_success_at = new Date().toISOString();
        scheduleData.last_error = null;
      } else if (effectiveStatus === "partial") {
        scheduleData.status = "partial";
        scheduleData.last_success_at = new Date().toISOString();
        scheduleData.last_error = `Partial: ${body.files_downloaded ?? "?"}/${body.total_files ?? "?"} files`;
      } else if (effectiveStatus === "error") {
        scheduleData.status = "error";
        scheduleData.last_error = body.error_message ?? "Unknown error";
      } else if (effectiveStatus === "skipped") {
        scheduleData.status = "skipped";
      }

      const { error: schedError } = await supabase
        .from("download_schedule")
        .upsert(scheduleData, { onConflict: "imei" });

      if (schedError) {
        console.error("Schedule upsert error:", schedError);
      }

      // Increment attempts_today via raw update after upsert
      if (effectiveStatus === "skipped") {
        await supabase.rpc("increment_attempts_today", { p_imei: body.imei }).catch(() => {
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
