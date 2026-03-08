

## Problem Analysis

The `dayDistance` value of 768 km (0x0300) appearing repeatedly across many days is caused by incorrect parsing of the **card activity daily record** format.

### Root Cause

Per **Annex 1C, Appendix 1 §2.9** (`CardActivityDailyRecord`), the card activity format is:

```text
| Field                      | Size    |
|----------------------------|---------|
| previousRecordLength       | 2 bytes |
| recordLength               | 2 bytes |  ← "structuresize" of remaining data
| activityRecordDate         | 4 bytes |  (TimeReal)
| dailyPresenceCounter       | 2 bytes |
| activityDayDistance         | 2 bytes |  (Distance, km)
| activityChangeInfo[N]      | N×2 bytes | where N = (recordLength - 8) / 2
```

Our parser has **two errors**:

1. **Missing length prefix**: The structured parser (`parseActivities`) skips to position 5 or 8 assuming a RecordArray header, but card activity data uses `previousRecordLength + recordLength` (4 bytes) before each record's timestamp — not a RecordArray header.

2. **Phantom `activityChangeCount` field**: Both parsers read 2 bytes after `dayDistance` as an explicit `activityChangeCount`. This field **does not exist** in the card format. Those 2 bytes are actually the **first ActivityChangeInfo word**. The real count is derived from `(recordLength - 8) / 2`.

The raw scanner finds timestamps correctly (so dates and distance at offset+6 are fine for the first match), but because it reads the first activity word as a count, subsequent record boundaries get corrupted, and for the structured parser the cascading misalignment causes wrong bytes to be read as `dayDistance`.

### Plan

**File: `src/lib/ddd-parser.ts`**

1. **Rewrite `parseActivities` to follow the card format spec**:
   - Read `previousRecordLength` (2 bytes) + `recordLength` (2 bytes) before each daily record
   - Read timestamp (4 bytes), dailyPresenceCounter (2 bytes), dayDistance (2 bytes)
   - Compute activity change count as `(recordLength - 8) / 2` — no explicit count field
   - Handle the cyclic buffer header: first 8 bytes = `oldestProcessedDate` (4) + `mostRecentDownloadDate` (4), or a TLV/RecordArray prefix
   - Use `recordLength` to advance to the next record reliably

2. **Fix the raw scanner (`parseRawActivitiesFile`)** to also derive count from context:
   - When scanning for timestamps, look 4 bytes before for a plausible `recordLength` value
   - If found, use `(recordLength - 8) / 2` as the activity count instead of reading offset+8 as count
   - Fall back to heuristic count (scan until next valid timestamp) when no length prefix is available

3. **Update tests** to verify that `dayDistance` values are not all identical (regression check).

### Technical Details

- The card cyclic buffer starts with 8 bytes: `OldestProcessedDate` (TimeReal) + `MostRecentDownloadDate` (TimeReal)
- Records are variable-length; `previousRecordLength` enables backward traversal of the cyclic buffer
- `recordLength` includes everything from `activityRecordDate` to end of `activityChangeInfo[]`, so `recordLength = 8 + N*2`
- Distance type is uint16 big-endian, value in whole km

