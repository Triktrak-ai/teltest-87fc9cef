import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Smartphone } from "lucide-react";

interface Device {
  id: string;
  imei: string;
  label: string | null;
}

export function DeviceManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [newImei, setNewImei] = useState("");
  const [newLabel, setNewLabel] = useState("");

  const fetchDevices = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_devices").select("id, imei, label").eq("user_id", user.id);
    setDevices((data as Device[]) ?? []);
  };

  useEffect(() => { fetchDevices(); }, [user]);

  const addDevice = async () => {
    const imei = newImei.trim();
    if (!imei || !user) return;
    const { error } = await supabase.from("user_devices").insert({
      user_id: user.id,
      imei,
      label: newLabel.trim() || null,
    });
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      setNewImei("");
      setNewLabel("");
      fetchDevices();
    }
  };

  const removeDevice = async (id: string) => {
    await supabase.from("user_devices").delete().eq("id", id);
    fetchDevices();
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Moje urządzenia</h3>
      </div>
      {devices.length > 0 ? (
        <div className="space-y-1">
          {devices.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded bg-muted/50 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <code className="text-xs">{d.imei}</code>
                {d.label && <span className="text-xs text-muted-foreground">— {d.label}</span>}
              </div>
              <button onClick={() => removeDevice(d.id)} className="text-destructive hover:text-destructive/80">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Brak przypisanych urządzeń. Dodaj IMEI, aby widzieć sesje.</p>
      )}
      <div className="flex items-center gap-2">
        <Input placeholder="IMEI" value={newImei} onChange={(e) => setNewImei(e.target.value)} className="h-8 text-xs" />
        <Input placeholder="Etykieta (opcj.)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-8 w-36 text-xs" />
        <Button size="sm" variant="outline" onClick={addDevice} className="h-8">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
