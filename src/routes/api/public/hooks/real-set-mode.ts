import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "../../../../integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/hooks/real-set-mode")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { dry_run?: boolean };
        if (typeof body.dry_run !== "boolean") {
          return Response.json({ error: "dry_run boolean required" }, { status: 400 });
        }
        const { error } = await supabaseAdmin
          .from("real_bot_config")
          .update({ dry_run: body.dry_run })
          .eq("id", 1);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, dry_run: body.dry_run });
      },
    },
  },
});
