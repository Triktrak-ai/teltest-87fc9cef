
# Naprawa: WebReporter nie raportuje bledow CardBridge

## Problem

W `Program.cs` polaczenie z CardBridge (`bridge.ConnectAsync()`) jest wykonywane PRZED utworzeniem `DddSession`. Gdy CardBridge zwraca blad (np. WebSocket 404), wyjatek jest lapany w `catch` w `Program.cs`, ale tam nie ma zadnego `WebReporter` -- wiec zaden raport nie trafia do bazy danych.

## Rozwiazanie

Przeniesc tworzenie `WebReporter` do `Program.cs` tak, aby istnial PRZED polaczeniem z CardBridge. Dzieki temu kazdy blad -- rowniez blad polaczenia z CardBridge -- zostanie zaraportowany do dashboardu.

## Zmiany w plikach

### 1. `csharp/TachoDddServer/Program.cs`

- Utworzyc `WebReporter` na poczatku bloku `Task.Run`, przed `bridge.ConnectAsync()`
- W `catch` wywolac `webReporter.ReportError(...)` z informacja o bledzie
- Przekazac istniejacy `WebReporter` do konstruktora `DddSession` (zamiast surowych parametrow URL/key)

### 2. `csharp/TachoDddServer/Session/DddSession.cs`

- Zmienic konstruktor: zamiast przyjmowac `webReportUrl`, `webReportApiKey`, `webReportEnabled` (3 parametry) -- przyjmowac gotowy `WebReporter?`
- Usunac tworzenie `WebReporter` z konstruktora (linia 74)

### 3. `csharp/TachoDddServer/Reporting/WebReporter.cs`

- Bez zmian -- klasa jest juz gotowa do uzycia zewnetrznego

## Wynik

Nawet jesli CardBridge jest nieosiagalny, dashboard pokaze sesje ze statusem "error" i komunikatem "CardBridge connection failed: WebSocketException ...". Kazde polaczenie TCP bedzie widoczne w dashboardzie.
