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
    const fetch = async () => {
      const [devRes, profRes] = await Promise.all([
        supabase.from("user_devices").select("imei, vehicle_plate, user_id"),
        supabase.from("profiles").select("id, full_name"),
      ]);
      const devs = (devRes.data ?? []) as any[];
      const profs = (profRes.data ?? []) as any[];
      const profMap = new Map(profs.map((p: any) => [p.id, p.full_name || "Brak nazwy"]));
      const m = new Map<string, ImeiOwner>();
      for (const d of devs) {
        m.set(d.imei, {
          imei: d.imei,
          userName: profMap.get(d.user_id) ?? "Nieprzypisany",
          vehiclePlate: d.vehicle_plate,
        });
      }
      setMap(m);
    };
    fetch();
  }, [isAdmin]);

  return { getOwner: (imei: string) => map.get(imei), isAdmin };
}
