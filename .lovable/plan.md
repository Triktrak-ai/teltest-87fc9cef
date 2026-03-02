

# Naprawa logiki wykrywania niezgodności generacji

## Problem
Funkcja `isGenerationMismatch()` w `SessionsTable.tsx` nieprawidłowo oznacza niektóre kombinacje kart i tachografów jako niezgodne, wyświetlając błędny tooltip "dane karty kierowcy niedostępne".

Konkretne błędy w logice (linie 32-41):
- Karta Gen2v2 w VU Gen2v1/Gen2 jest oznaczana jako `culprit="card"` — ale karta Gen2v2 jest wstecznie kompatybilna i działa poprawnie
- Karta Gen2 w VU Gen1 jest oznaczana jako mismatch — ale karty firmowe Gen2 zazwyczaj działają w VU Gen1
- Komunikat mówi o "danych karty kierowcy" ale logika dotyczy karty firmowej (company card)

## Poprawka

### Zmiana w `src/components/SessionsTable.tsx`

**Nowa logika `isGenerationMismatch`:**

```text
Prawidłowe przypadki niezgodności (wg macierzy kompatybilności):
- VU Gen2v2 + karta Gen2v1/Gen2/Gen1 → ostrzeżenie przy karcie (ograniczony odczyt nowych sekcji)
- VU Gen2v1 + karta Gen1 → ostrzeżenie przy karcie (możliwy błąd autoryzacji)

Przypadki BEZ ostrzeżenia:
- Karta Gen2v2 w dowolnym VU → wstecznie kompatybilna
- Karta Gen1 w VU Gen1 → pełna kompatybilność
- Karta Gen2v1 w VU Gen2v1 → pełna kompatybilność
```

**Nowy komunikat tooltipa:**
Zamiast "dane karty kierowcy niedostępne", wyświetlać bardziej precyzyjny komunikat zależny od kontekstu:
- VU Gen2v2 + starsza karta: "Starsza karta firmowa — możliwy ograniczony odczyt danych Gen2v2"
- VU Gen1 + karta Gen2: usunąć ostrzeżenie (kompatybilne)

### Jeden plik do zmiany
`src/components/SessionsTable.tsx` — poprawka funkcji `isGenerationMismatch` (linie 32-41) oraz tooltipa (linia 186)

