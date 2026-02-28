
# TachoDDD — Plan rozwoju

## ✅ Zrealizowane

### Infrastruktura
- Serwer TCP (TachoDddServer) z maszyną stanów DDD
- CardBridgeService (WebSocket ↔ PC/SC)
- Protokół Codec 12 z weryfikacją CRC
- Detekcja generacji VU (Gen1/Gen2v1/Gen2v2) przez InterfaceVersion
- Post-download korekta generacji na podstawie tagów sekcji Overview
- Łączenie plików VU w jeden .ddd
- Dwufazowe pobieranie: segmenty VU (1-5) z Gen1 TRTP fallback, karty kierowcy (6-7) zawsze natywnym TRTP
- Diagnostyka slotów kart kierowcy: rozróżnienie empty_slot (<2s) vs access_denied (≥2s) na podstawie czasu odpowiedzi VU
- Jednorazowy retry karty kierowcy z TryResetCardState przy access_denied (≥2s)

### Logowanie i diagnostyka
- TrafficLogger (hex dump + dekodowane pakiety)
- SessionDiagnostics (raport TXT + JSON)
- WebReporter (raportowanie statusu do dashboardu)
- Upload logów sesji do storage (traffic.log, session.txt, session.json)

### Web Dashboard
- Tabela sesji z real-time aktualizacją
- Timeline zdarzeń sesji
- Harmonogram pobierania (download_schedule) z resetem
- Macierz kompatybilności karta/tachograf (dwie zakładki: firmowa + kierowcy)
- DDD Reader (parsowanie plików .ddd w przeglądarce)
- Karty statystyk

### Edge Functions
- `report-session` — raportowanie statusu z C# serwera
- `check-download` — download gate (1x/dzień per IMEI)
- `reset-download-schedule` — reset harmonogramu (z dashboardu lub C#)
- `upload-session-log` — upload logów do bucketu session-logs
- `toggle-download-block` — włączanie/wyłączanie blokady pobierania

### Kluczowe naprawy
- Auth w edge functions: `SUPABASE_ANON_KEY` w Lovable Cloud ma format `sb_publishable_...` ≠ JWT publishable key. Rozwiązanie: walidacja tokenu przez próbne zapytanie do bazy.

## 🔜 Do zrobienia

### Priorytet wysoki
- Ikony pobierania logów na dashboardzie (czeka na pierwsze `log_uploaded = true` z C# serwera)
- Detekcja typu karty (kierowcy vs firmowa) na podstawie EF_ICC cardType
- Wyświetlanie diagnostyki slotów (empty_slot/access_denied) na dashboardzie

### Priorytet średni
- Alert kompatybilności na dashboardzie (ostrzeżenie gdy karta+VU wypada jako 'warn')
- Filtrowanie sesji po IMEI/statusie/dacie
- Eksport danych sesji do CSV

### Priorytet niski
- Obsługa wielu czytników kart (wiele CardBridge)
- Automatyczne retry po utracie połączenia
