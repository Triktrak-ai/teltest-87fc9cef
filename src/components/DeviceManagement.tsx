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
  vehicle_plate: string | null;
  sim_number: string | null;
  comment: string | null;
}

export function DeviceManagement() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [newImei, setNewImei] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newVehiclePlate, setNewVehiclePlate] = useState("");
  const [newSimNumber, setNewSimNumber] = useState("");
  const [newComment, setNewComment] = useState("");

  const fetchDevices = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_devices").select("*").eq("user_id", user.id);
    setDevices(data ?? []);
  };

  useEffect(() => { fetchDevices(); }, [user]);

  const addDevice = async () => {
    if (!isAdmin) return;
    const imei = newImei.trim();
    if (!imei || !user) return;
    try {
      const { error } = await supabase.from("user_devices").insert({
        imei,
        label: newLabel.trim() || null,
        vehicle_plate: newVehiclePlate.trim() || null,
        sim_number: newSimNumber.trim() || null,
        comment: newComment.trim() || null,
        user_id: user.id,
      });
      if (error) throw error;
      setNewImei("");
      setNewLabel("");
      setNewVehiclePlate("");
      setNewSimNumber("");
      setNewComment("");
      fetchDevices();
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const removeDevice = async (id: string) => {
    if (!isAdmin) return;
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
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs">{d.imei}</code>
                {d.label && <span className="text-xs text-muted-foreground">— {d.label}</span>}
                {d.vehicle_plate && <span className="text-xs text-muted-foreground">🚗 {d.vehicle_plate}</span>}
                {d.sim_number && <span className="text-xs text-muted-foreground">📱 {d.sim_number}</span>}
                {d.comment && <span className="text-xs text-muted-foreground italic">({d.comment})</span>}
              </div>
              {isAdmin && (
                <button onClick={() => removeDevice(d.id)} className="text-destructive hover:text-destructive/80">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {isAdmin
            ? "Brak przypisanych urządzeń. Dodaj IMEI, aby widzieć sesje."
            : "Brak przypisanych urządzeń. Skontaktuj się z administratorem, aby przypisać IMEI."}
        </p>
      )}
      {isAdmin && (
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Input placeholder="IMEI" value={newImei} onChange={(e) => setNewImei(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Etykieta (opcj.)" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Nr rejestracyjny" value={newVehiclePlate} onChange={(e) => setNewVehiclePlate(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Nr SIM" value={newSimNumber} onChange={(e) => setNewSimNumber(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Komentarz" value={newComment} onChange={(e) => setNewComment(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button size="sm" variant="outline" onClick={addDevice} className="h-8 self-end">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
