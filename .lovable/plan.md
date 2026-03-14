

# Plan: Aktualizacja pełnej dokumentacji projektu

## Zakres zmian

### 1. Aktualizacja `docs/ARCHITECTURE.md`
- Dodanie sekcji **DDD Parser (Frontend)** z opisem per-day sequential parsing + fallback minute-regression
- Aktualizacja daty generacji na 2026-03-14
- Dodanie sekcji **Dual-mode Frontend** opisującej tryb Lovable Cloud (Supabase) vs Self-hosted (TachoWebApi)
- Dodanie sekcji **Statusy sesji** z pełnym opisem nazewnictwa i logiki przejść (connecting → auth → downloading → completed/partial/error/skipped)
- Dodanie sekcji **Race condition protection** w report-session
- Dodanie sekcji **Partial → Completed upgrade** logic
- Dodanie sekcji **Download gate** (check-download + schedule)
- Rozszerzenie ERD o pole `log_uploaded` w sessions

### 2. Aktualizacja `docs/MIGRATION.md`
- Dodanie sekcji **Krok 0 — Przygotowanie systemu Windows Server 2025** (RDP, Windows Update, PowerShell 7)
- Dodanie sekcji **CardBridgeService + ngrok** z opisem tunelowania WebSocket
- Dodanie sekcji **Konfiguracja DNS** (A record, TTL)
- Dodanie sekcji **Monitoring i diagnostyka** (Test-NetConnection, Event Viewer, sprawdzanie logów)
- Dodanie sekcji **Przełączanie frontendu z Lovable Cloud na Self-hosted** (zmiana VITE_API_BASE_URL, przebudowa)
- Rozszerzenie FAQ o migrację danych z Lovable Cloud
- Dodanie sekcji **Troubleshooting** z najczęstszymi problemami (zombie sessions, stuck downloading, unknown IMEI)
- Dodanie sekcji **Struktura katalogów na serwerze** (pełne drzewo C:\TachoDDD\)
- Dodanie informacji o portach ngrok i CardBridge

### 3. Rozmiar zmian
- ARCHITECTURE.md: ~200 linii nowych (z 957 do ~1150)
- MIGRATION.md: ~150 linii nowych (z 653 do ~800)

Wszystkie zmiany to rozszerzenia istniejącej dokumentacji, bez usuwania obecnych sekcji.

