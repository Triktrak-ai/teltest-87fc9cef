
Cel: sprawić, żeby logi lokalne (pliki) i logi do backendu powstawały także wtedy, gdy połączenie z CardBridge kończy się błędem 404/timeout na samym starcie.

Co wykryłem w obecnym kodzie (przyczyny):
1) `DddSession` (a więc też `TrafficLogger` i `SessionDiagnostics`) tworzysz dopiero po `await bridge.ConnectAsync()` w `Program.cs`.  
   Skutek: gdy CardBridge padnie na starcie, sesja nie powstaje, więc pliki `traffic_*.log` i `session_*.txt/json` nie są tworzone.
2) `WebReporter` wysyła dane fire-and-forget (`_ = SendAsync(...)`) i jest szybko dispose’owany.  
   Skutek: requesty kończą się „The operation was canceled”.
3) `session_id` wysyłane z C# ma 12 znaków (`Guid... [..12]`), a kolumna `sessions.id` w bazie ma typ `uuid`.  
   Skutek: nawet po poprawnym wysłaniu requestu zapis sesji i eventu będzie odrzucany.
4) Funkcja `report-session` wymaga `imei`, a przy błędzie startowym IMEI jeszcze nie istnieje.  
   Skutek: wczesne błędy są odrzucane walidacją.

Plan wdrożenia:
1) Przenieść odpowiedzialność za `bridge.ConnectAsync()` do `DddSession.RunAsync()`
   - Plik: `csharp/TachoDddServer/Program.cs`
     - Usunąć `await bridge.ConnectAsync()` z `Program.cs`.
     - Tworzyć `DddSession` od razu po akceptacji TCP klienta (przed próbą połączenia CardBridge).
     - Wywoływać tylko `await session.RunAsync()`.
   - Plik: `csharp/TachoDddServer/Session/DddSession.cs`
     - Na początku `RunAsync()` (wewnątrz `try`) wykonać `await _bridge.ConnectAsync()`.
     - Dzięki temu każdy błąd inicjalizacji trafi do `catch/finally` w `DddSession`, więc:
       - powstanie `traffic_*.log`,
       - powstanie `session_*.txt` i `session_*.json`,
       - będzie pełny wpis diagnostyczny.

2) Ustabilizować wysyłkę `WebReporter` (bez utraty requestów przy dispose)
   - Plik: `csharp/TachoDddServer/Reporting/WebReporter.cs`
     - Dodać mechanizm śledzenia zadań wysyłki (np. kolejka/chain tasków albo lista in-flight z lockiem).
     - Dodać `FlushAsync()` czekające na zakończenie oczekujących requestów.
     - Zachować API synchroniczne (`ReportStatus/ReportError`) lub przejść na `Task`, ale krytycznie: zapewnić flush przed dispose.
   - Plik: `csharp/TachoDddServer/Program.cs`
     - W `finally` zawsze `await webReporter.FlushAsync()` przed wyjściem z zakresu `using`.

3) Naprawić identyfikator sesji do formatu zgodnego z bazą
   - Plik: `csharp/TachoDddServer/Program.cs`
     - Generować pełny UUID (`Guid.NewGuid().ToString()`), nie skracać do 12 znaków.
   - Spiąć ten sam `sessionId` między:
     - `WebReporter`,
     - diagnostyką sesji (`SessionDiagnostics`),
     - nazwami plików logów (można trzymać pełny albo skrócony tylko do nazwy pliku, ale ID raportowe musi być UUID).

4) Obsłużyć brak IMEI przy błędach startowych
   - Wariant preferowany (minimalnie inwazyjny):
     - Plik: `WebReporter.cs` — domyślnie wysyłać `imei: "unknown"` dopóki `SetImei(...)` nie zostanie wywołane.
   - Wariant dodatkowo odporny:
     - Plik: `supabase/functions/report-session/index.ts`
       - Poluzować walidację: wymagać tylko `session_id`, a `imei` fallbackować do `"unknown"`.
   - To umożliwi zapis błędów „startupowych” bez czekania na IMEI.

5) Drobna poprawka jakości kodu (przy okazji)
   - Plik: `csharp/TachoDddServer/Session/DddSession.cs`
     - Naprawić warning `CS8602` przy `result.Frame` (linia ~208) przez jawny null-guard.
   - Nie blokuje logów, ale usuwa potencjalny crash edge-case.

Kolejność wdrożenia:
1. `WebReporter` flush + `Program.cs` await flush.
2. UUID session id + spójne session id między komponentami.
3. Przeniesienie `ConnectAsync` do `DddSession.RunAsync`.
4. Fallback IMEI (`unknown`) i ewentualnie poluzowanie walidacji funkcji backendowej.
5. Null-guard `CS8602`.

Plan testów po wdrożeniu:
1) Test błędu startowego (CardBridge URL celowo błędny/404):
   - Oczekiwane:
     - powstaje `traffic_*.log` w `C:\TachoDDD\Logs`,
     - powstają `session_*.txt` i `session_*.json`,
     - w dashboardzie backendu pojawia się sesja ze statusem `error`.
2) Test poprawnej sesji:
   - Oczekiwane:
     - statusy przechodzą `connecting -> ... -> completed/error`,
     - eventy pojawiają się na osi czasu,
     - pliki lokalne i wpisy backendowe mają ten sam `session_id`.
3) Test regresji:
   - brak ostrzeżeń „WebReporter: The operation was canceled”.

Kryteria akceptacji:
- Dla każdego połączenia TCP powstaje lokalny ślad diagnostyczny (nawet przy błędzie CardBridge na starcie).
- Wczesne błędy są widoczne w dashboardzie backendowym.
- Brak anulowanych wysyłek reportera przy zamykaniu sesji.
- Brak błędu formatu `session_id` vs `uuid`.
