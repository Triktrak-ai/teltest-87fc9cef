import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
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
        const [devs, profs] = await Promise.all([
          apiFetch<{ imei: string; vehicle_plate: string | null; user_id: string }[]>("/api/user-devices"),
          apiFetch<{ id: string; full_name: string }[]>("/api/admin/users"),
        ]);
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
        // Non-admin or error — ignore
      }
    };
    load();
  }, [isAdmin]);

  return { getOwner: (imei: string) => map.get(imei), isAdmin };
}
