

# Paginacja tabeli sesji — zakładki po 30 rekordów

## Podejście
Dodać paginację na dole tabeli sesji z przyciskami stron (1, 2, 3...), wyświetlając po 30 rekordów na stronę. Użyję `useState` do śledzenia aktualnej strony i `useMemo` do wycięcia odpowiedniego fragmentu z `filtered`.

## Zmiany w `src/components/SessionsTable.tsx`

1. **Dodać state `currentPage`** (domyślnie 1), resetowany przy zmianie `filtered`
2. **Dodać `useMemo` dla paginacji**: wyliczyć `totalPages`, `paginatedSessions = filtered.slice((page-1)*30, page*30)`
3. **Dodać pasek paginacji** pod tabelą — przyciski numeryczne stron + "Poprzednia"/"Następna", informacja o zakresie (np. "31–60 z 120")
4. **Resetować stronę na 1** gdy zmienia się `adminFilter`

Styl: spójny z istniejącym designem (Button variant="ghost"/"outline", text-xs, muted colors).

