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
    const formData = await req.formData();
    const sessionId = formData.get("session_id") as string;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "session_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const uploadedFiles: string[] = [];

    // Upload each file from the form data
    for (const [key, value] of formData.entries()) {
      if (key === "session_id") continue;
      if (!(value instanceof File)) continue;

      const filePath = `${sessionId}/${value.name}`;
      const bytes = new Uint8Array(await value.arrayBuffer());

      const { error } = await supabase.storage
        .from("session-logs")
        .upload(filePath, bytes, {
          contentType: value.type || "application/octet-stream",
          upsert: true,
        });

      if (error) {
        console.error(`Upload error for ${filePath}:`, error);
      } else {
        uploadedFiles.push(filePath);
      }
    }

    // Mark session as having logs uploaded
    if (uploadedFiles.length > 0) {
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ log_uploaded: true })
        .eq("id", sessionId);

      if (updateError) {
        console.error("Failed to update log_uploaded:", updateError);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, files: uploadedFiles }),
      {
        status: 200,
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
