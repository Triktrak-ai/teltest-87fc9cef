import { useEffect, useState, useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";

interface DeviceInfo {
  imei: string;
  label: string | null;
  vehicle_plate: string | null;
  user_name: string;
  user_id: string;
}

interface AdminFilterProps {
  onFilterChange: (imeis: string[] | null) => void;
}

export function AdminFilter({ onFilterChange }: AdminFilterProps) {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const users = await apiFetch<{ id: string; full_name: string; devices: { imei: string; label: string | null; vehicle_plate: string | null }[] }[]>("/api/admin/users");
        const devs: DeviceInfo[] = [];
        for (const u of users) {
          for (const d of u.devices) {
            devs.push({
              imei: d.imei,
              label: d.label,
              vehicle_plate: d.vehicle_plate,
              user_id: u.id,
              user_name: u.full_name || "Brak nazwy",
            });
          }
        }
        setDevices(devs);
      } catch {
        // ignore
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase().trim();
    const matching = devices.filter(
      (d) =>
        d.imei.toLowerCase().includes(q) ||
        (d.vehicle_plate && d.vehicle_plate.toLowerCase().includes(q)) ||
        d.user_name.toLowerCase().includes(q) ||
        (d.label && d.label.toLowerCase().includes(q))
    );
    return matching.map((d) => d.imei);
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
