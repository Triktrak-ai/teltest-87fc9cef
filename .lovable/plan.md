

## Analysis

The expert specification confirms a critical architectural mismatch in `parseVuActivitiesRecordArrays`. The current implementation collects ALL dates, ALL odometers, and ALL activity words into flat arrays, then attempts to split activities into day groups using slot-0 minute regression. 

The specification states that RecordArrays are transmitted **per-day sequentially**:
```text
Day 1: [0x06 date] [0x05 odometer] [0x0D cardIW] [0x01 activities] [0x08 signature]
Day 2: [0x06 date] [0x05 odometer] [0x0D cardIW] [0x01 activities] [0x08 signature]
...
```

The flat-collection approach works coincidentally when data happens to be grouped by type, but fails when the structure is per-day interleaved — which is the canonical format per Annex 1C.

Additionally, current tests show 7-8 days parsed, suggesting the data in test files may be type-grouped. But for full spec compliance, the parser must handle per-day sequential layout.

## Plan

### 1. Rewrite `parseVuActivitiesRecordArrays` to per-day sequential parsing

Replace flat collection with stateful per-day iteration:
- Track `currentDate`, `currentOdometer`, `currentActivityWords` as the parser encounters RecordArrays
- When a new `0x06` (DateOfDayDownloaded) is encountered and there's already a pending day, emit the completed day record
- After the loop, emit the final pending day
- This eliminates the minute-regression day-splitting logic entirely (lines 2485-2503)

### 2. Maintain backward compatibility

Keep the flat-collection as a fallback: if per-day sequential parsing yields 0 results (data is type-grouped), fall back to the current logic. This handles edge cases where VU firmware groups all dates together.

### 3. No changes needed to other fixes

The previous fixes (0x0000 valid, 100k limit, 400-day window, filterDistanceArtifacts, dur≤0 tolerance) remain correct and aligned with the spec.

## Technical detail

```text
Current flow:
  parseVuActivitiesRecordArrays()
    → collect dates[], odometers[], activityWords[]
    → split activityWords by slot-0 minute regression → dayGroups[]
    → zip dates[i] + dayGroups[i]

New flow:
  parseVuActivitiesRecordArrays()
    → iterate RecordArrays sequentially
    → on 0x06: flush pending day, start new day with this date
    → on 0x05: set odometer for current day
    → on 0x01: append activity words to current day
    → on 0x08/other: skip
    → flush final pending day
    → if no days found: fallback to flat-collection + minute-regression
```

Lines affected: ~2363-2543 in `src/lib/ddd-parser.ts` (the `parseVuActivitiesRecordArrays` function).

