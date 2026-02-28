
# Rozszerzenie danych urządzeń o parametry pojazdu

## Cel
Dodanie do każdego urządzenia (IMEI) trzech nowych pól: numer rejestracyjny pojazdu, numer SIM, komentarz. Widok admina (zakładka Admin) pozostaje bez zmian w layoutzie -- nadal przełącza się między dashboardem a panelem admina.

## 1. Migracja bazy danych

Dodanie trzech kolumn do tabeli `user_devices`:
```sql
ALTER TABLE public.user_devices
  ADD COLUMN vehicle_plate text,
  ADD COLUMN sim_number text,
  ADD COLUMN comment text;
```

## 2. Zmiany w `AdminPanel.tsx`

- Rozszerzenie interfejsu `UserRow.devices` o `vehicle_plate`, `sim_number`, `comment`
- Wyświetlanie nowych pól przy każdym urządzeniu (obok IMEI i etykiety)
- Dodanie trzech nowych inputów w formularzu dodawania urządzenia: "Nr rejestracyjny", "Nr SIM", "Komentarz"
- Nowe stany: `newVehiclePlate`, `newSimNumber`, `newComment` (Record per user)
- Aktualizacja `addDevice()` o nowe pola w insercie
- Aktualizacja mappingu w `fetchUsers` o nowe kolumny

## 3. Zmiany w `DeviceManagement.tsx`

- Rozszerzenie interfejsu `Device` o `vehicle_plate`, `sim_number`, `comment`
- Wyświetlanie nowych pól przy każdym urządzeniu
- Dodanie inputów w formularzu dodawania: "Nr rejestracyjny", "Nr SIM", "Komentarz"
- Nowe stany: `newVehiclePlate`, `newSimNumber`, `newComment`
- Aktualizacja `addDevice()` i `fetchDevices()` selecta

## Podsumowanie zmian

| Plik | Zmiana |
|------|--------|
| Migracja SQL | +3 kolumny w `user_devices` |
| `AdminPanel.tsx` | +3 pola w formularzu i wyświetlaniu urządzeń |
| `DeviceManagement.tsx` | +3 pola w formularzu i wyświetlaniu urządzeń |
