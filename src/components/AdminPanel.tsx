import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Shield, Trash2, Plus } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string;
  phone: string | null;
  approved: boolean;
  created_at: string;
  email?: string;
  isAdmin: boolean;
  devices: { id: string; imei: string; label: string | null }[];
}

export function AdminPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newImei, setNewImei] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});

  const fetchUsers = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, devicesRes] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("user_roles").select("*"),
      supabase.from("user_devices").select("*"),
    ]);

    const profiles = profilesRes.data ?? [];
    const roles = rolesRes.data ?? [];
    const devices = devicesRes.data ?? [];

    const merged: UserRow[] = profiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      phone: p.phone,
      approved: p.approved,
      created_at: p.created_at,
      isAdmin: roles.some((r: any) => r.user_id === p.id && r.role === "admin"),
      devices: devices.filter((d: any) => d.user_id === p.id).map((d: any) => ({ id: d.id, imei: d.imei, label: d.label })),
    }));

    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleApproval = async (userId: string, approved: boolean) => {
    await supabase.from("profiles").update({ approved: !approved }).eq("id", userId);
    toast({ title: approved ? "Konto dezaktywowane" : "Konto zatwierdzone" });
    fetchUsers();
  };

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    if (isAdmin) {
      await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
    } else {
      await supabase.from("user_roles").insert({ user_id: userId, role: "admin" as any });
    }
    toast({ title: isAdmin ? "Rola admin usunięta" : "Rola admin nadana" });
    fetchUsers();
  };

  const addDevice = async (userId: string) => {
    const imei = newImei[userId]?.trim();
    if (!imei) return;
    const { error } = await supabase.from("user_devices").insert({
      user_id: userId,
      imei,
      label: newLabel[userId]?.trim() || null,
    });
    if (error) {
      toast({ title: "Błąd", description: error.message, variant: "destructive" });
    } else {
      setNewImei((p) => ({ ...p, [userId]: "" }));
      setNewLabel((p) => ({ ...p, [userId]: "" }));
      fetchUsers();
    }
  };

  const removeDevice = async (deviceId: string) => {
    await supabase.from("user_devices").delete().eq("id", deviceId);
    fetchUsers();
  };

  if (loading) return <div className="text-sm text-muted-foreground">Ładowanie użytkowników...</div>;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Panel administracyjny</h2>
      <div className="space-y-4">
        {users.map((u) => (
          <div key={u.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{u.full_name || "Brak nazwy"}</span>
                {u.phone && <span className="ml-2 text-xs text-muted-foreground">{u.phone}</span>}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.approved ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                    {u.approved ? "Zatwierdzony" : "Oczekuje"}
                  </span>
                  {u.isAdmin && (
                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium">Admin</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={u.approved ? "destructive" : "default"} onClick={() => toggleApproval(u.id, u.approved)}>
                  {u.approved ? <X className="h-3.5 w-3.5 mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  {u.approved ? "Dezaktywuj" : "Zatwierdź"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleAdmin(u.id, u.isAdmin)}>
                  <Shield className="h-3.5 w-3.5 mr-1" />
                  {u.isAdmin ? "Usuń admin" : "Nadaj admin"}
                </Button>
              </div>
            </div>

            {/* Devices */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground">Urządzenia (IMEI):</span>
              {u.devices.length > 0 ? (
                <div className="space-y-1">
                  {u.devices.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 text-sm">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.imei}</code>
                      {d.label && <span className="text-xs text-muted-foreground">{d.label}</span>}
                      <button onClick={() => removeDevice(d.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Brak przypisanych urządzeń</p>
              )}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="IMEI"
                  value={newImei[u.id] || ""}
                  onChange={(e) => setNewImei((p) => ({ ...p, [u.id]: e.target.value }))}
                  className="h-8 w-40 text-xs"
                />
                <Input
                  placeholder="Etykieta (opcj.)"
                  value={newLabel[u.id] || ""}
                  onChange={(e) => setNewLabel((p) => ({ ...p, [u.id]: e.target.value }))}
                  className="h-8 w-32 text-xs"
                />
                <Button size="sm" variant="outline" onClick={() => addDevice(u.id)} className="h-8">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
