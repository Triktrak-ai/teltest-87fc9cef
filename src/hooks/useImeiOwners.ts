import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface ImeiOwner {
  imei: string;
  userName: string;
  vehiclePlate: string | null;
}

export function useImeiOwners() {
  const { isAdmin } = useAuth();
  const [map, setMap] = useState<Map<string, ImeiOwner>>(new Map());

  useEffect(() => {
    if (!isAdmin) return;
    const load = async () => {
      try {
        const [{ data: devs }, { data: profs }] = await Promise.all([
          supabase.from("user_devices").select("imei, vehicle_plate, user_id"),
          supabase.from("profiles").select("id, full_name"),
        ]);
        if (!devs || !profs) return;
        const profMap = new Map(profs.map((p) => [p.id, p.full_name || "Brak nazwy"]));
        const m = new Map<string, ImeiOwner>();
        for (const d of devs) {
          m.set(d.imei, {
            imei: d.imei,
            userName: profMap.get(d.user_id) ?? "Nieprzypisany",
            vehiclePlate: d.vehicle_plate,
          });
        }
        setMap(m);
      } catch {
        // ignore
      }
    };
    load();
  }, [isAdmin]);

  return { getOwner: (imei: string) => map.get(imei), isAdmin };
}
