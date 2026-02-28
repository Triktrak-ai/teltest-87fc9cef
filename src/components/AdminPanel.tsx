import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Shield, Trash2, Plus, UserPlus, Loader2 } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string;
  phone: string | null;
  approved: boolean;
  created_at: string;
  email?: string;
  is_admin: boolean;
  devices: { id: string; imei: string; label: string | null; vehicle_plate: string | null; sim_number: string | null; comment: string | null }[];
}

export function AdminPanel() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newImei, setNewImei] = useState<Record<string, string>>({});
  const [newLabel, setNewLabel] = useState<Record<string, string>>({});
  const [newVehiclePlate, setNewVehiclePlate] = useState<Record<string, string>>({});
  const [newSimNumber, setNewSimNumber] = useState<Record<string, string>>({});
  const [newComment, setNewComment] = useState<Record<string, string>>({});

  // New user form
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPhone, setNewUserPhone] = useState("");
  const [creatingUser, setCreatingUser] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<UserRow[]>("/api/admin/users");
      setUsers(data);
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const toggleApproval = async (userId: string, approved: boolean) => {
    try {
      await apiFetch(`/api/admin/users/${userId}/approve`, { method: "PATCH" });
      toast({ title: approved ? "Konto dezaktywowane" : "Konto zatwierdzone" });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const toggleAdmin = async (userId: string, isAdmin: boolean) => {
    try {
      await apiFetch(`/api/admin/roles/${userId}/toggle-admin`, { method: "POST" });
      toast({ title: isAdmin ? "Rola admin usunięta" : "Rola admin nadana" });
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const addDevice = async (userId: string) => {
    const imei = newImei[userId]?.trim();
    if (!imei) return;
    try {
      await apiFetch("/api/user-devices", {
        method: "POST",
        body: JSON.stringify({
          imei,
          label: newLabel[userId]?.trim() || null,
          vehicle_plate: newVehiclePlate[userId]?.trim() || null,
          sim_number: newSimNumber[userId]?.trim() || null,
          comment: newComment[userId]?.trim() || null,
          user_id: userId,
        }),
      });
      setNewImei((p) => ({ ...p, [userId]: "" }));
      setNewLabel((p) => ({ ...p, [userId]: "" }));
      setNewVehiclePlate((p) => ({ ...p, [userId]: "" }));
      setNewSimNumber((p) => ({ ...p, [userId]: "" }));
      setNewComment((p) => ({ ...p, [userId]: "" }));
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    }
  };

  const removeDevice = async (deviceId: string) => {
    await apiFetch(`/api/user-devices/${deviceId}`, { method: "DELETE" });
    fetchUsers();
  };

  const createUser = async () => {
    if (!newUserEmail.trim() || !newUserPassword.trim()) {
      toast({ title: "Błąd", description: "Email i hasło są wymagane", variant: "destructive" });
      return;
    }
    setCreatingUser(true);
    try {
      const data = await apiFetch<{ id: string; email: string }>("/api/auth/admin/create-user", {
        method: "POST",
        body: JSON.stringify({
          email: newUserEmail.trim(),
          password: newUserPassword.trim(),
          full_name: newUserName.trim(),
          phone: newUserPhone.trim() || null,
        }),
      });
      toast({ title: "Użytkownik utworzony", description: data.email });
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserName("");
      setNewUserPhone("");
      setShowAddUser(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Błąd", description: err.message, variant: "destructive" });
    } finally {
      setCreatingUser(false);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Ładowanie użytkowników...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Panel administracyjny</h2>
        <Button size="sm" variant="outline" onClick={() => setShowAddUser(!showAddUser)}>
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          {showAddUser ? "Anuluj" : "Dodaj użytkownika"}
        </Button>
      </div>

      {showAddUser && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Nowy użytkownik</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Input placeholder="Email *" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Hasło *" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Imię i nazwisko" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} className="h-8 text-xs" />
            <Input placeholder="Telefon (opcj.)" value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button size="sm" onClick={createUser} disabled={creatingUser}>
            {creatingUser ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Utwórz konto
          </Button>
          <p className="text-xs text-muted-foreground">Konto zostanie automatycznie zatwierdzone i email potwierdzony.</p>
        </div>
      )}

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
                  {u.is_admin && (
                    <span className="inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-xs font-medium">Admin</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant={u.approved ? "destructive" : "default"} onClick={() => toggleApproval(u.id, u.approved)}>
                  {u.approved ? <X className="h-3.5 w-3.5 mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                  {u.approved ? "Dezaktywuj" : "Zatwierdź"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleAdmin(u.id, u.is_admin)}>
                  <Shield className="h-3.5 w-3.5 mr-1" />
                  {u.is_admin ? "Usuń admin" : "Nadaj admin"}
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
                      {d.vehicle_plate && <span className="text-xs text-muted-foreground">🚗 {d.vehicle_plate}</span>}
                      {d.sim_number && <span className="text-xs text-muted-foreground">📱 {d.sim_number}</span>}
                      {d.comment && <span className="text-xs text-muted-foreground italic">({d.comment})</span>}
                      <button onClick={() => removeDevice(d.id)} className="text-destructive hover:text-destructive/80">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Brak przypisanych urządzeń</p>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Input placeholder="IMEI" value={newImei[u.id] || ""} onChange={(e) => setNewImei((p) => ({ ...p, [u.id]: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Etykieta (opcj.)" value={newLabel[u.id] || ""} onChange={(e) => setNewLabel((p) => ({ ...p, [u.id]: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nr rejestracyjny" value={newVehiclePlate[u.id] || ""} onChange={(e) => setNewVehiclePlate((p) => ({ ...p, [u.id]: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nr SIM" value={newSimNumber[u.id] || ""} onChange={(e) => setNewSimNumber((p) => ({ ...p, [u.id]: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Komentarz" value={newComment[u.id] || ""} onChange={(e) => setNewComment((p) => ({ ...p, [u.id]: e.target.value }))} className="h-8 text-xs" />
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
