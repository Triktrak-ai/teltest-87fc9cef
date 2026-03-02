import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface DeviceInfo {
  imei: string;
  label: string | null;
  vehicle_plate: string | null;
  user_name: string;
  user_id: string;
}

export interface AdminFilterResult {
  /** IMEIs matched from user_devices (by name, plate, label, imei) */
  imeis: string[];
  /** Raw query for direct IMEI substring matching in sessions */
  rawQuery: string;
}

interface AdminFilterProps {
  onFilterChange: (result: AdminFilterResult | null) => void;
}

export function AdminFilter({ onFilterChange }: AdminFilterProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: devs }, { data: profs }] = await Promise.all([
          supabase.from("user_devices").select("imei, label, vehicle_plate, user_id"),
          supabase.from("profiles").select("id, full_name"),
        ]);
        if (!devs || !profs) return;
        const profMap = new Map(profs.map((p) => [p.id, p.full_name || "Brak nazwy"]));
        const items: DeviceInfo[] = devs.map((d) => ({
          imei: d.imei,
          label: d.label,
          vehicle_plate: d.vehicle_plate,
          user_id: d.user_id,
          user_name: profMap.get(d.user_id) ?? "Brak nazwy",
        }));
        setDevices(items);
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const filtered = useMemo((): AdminFilterResult | null => {
    if (!query.trim()) return null;
    const q = query.toLowerCase().trim();
    const matchingImeis = new Set<string>();
    devices.forEach((d) => {
      if (
        d.imei.toLowerCase().includes(q) ||
        (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(q)) ||
        d.user_name.toLowerCase().includes(q) ||
        (d.label && d.label.toLowerCase().includes(q))
      ) {
        matchingImeis.add(d.imei);
      }
    });
    return { imeis: Array.from(matchingImeis), rawQuery: q };
  }, [query, devices]);

  useEffect(() => {
    onFilterChange(filtered);
  }, [filtered, onFilterChange]);

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Filtruj: użytkownik, IMEI, nr rej..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8 pl-8 pr-8 text-xs w-72"
      />
      {query && (
        <button
          onClick={() => setQuery("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
