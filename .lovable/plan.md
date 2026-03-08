

## Analysis: Activities parser vs tachograph-go reference

### Key differences found

Comparing our `parseActivities` function against the reference implementation in `tachograph-go/internal/card/activity.go` reveals the following issues:

**1. Missing cyclic buffer header and pointer-based traversal (critical)**

The reference implementation reads a 4-byte header at the start of the `CardDriverActivity` data:
- `oldestDayRecordPointer` (2 bytes) — offset into cyclic buffer
- `newestDayRecordPointer` (2 bytes) — offset into cyclic buffer

It then starts at `newestDayRecordPointer` and traverses **backward** through the linked list using each record's `previousRecordLength` field, handling cyclic wrap-around with modular arithmetic.

Our parser tries fixed skip offsets (0, 4, 5, 8, 3, 12) and scans **forward**, breaking on the first invalid record. This means:
- Records after a cyclic buffer wrap-around are missed
- If the buffer starts mid-record (common in cyclic buffers), parsing fails entirely

**2. No cyclic wrap-around handling**

The reference copies record bytes with `buffer[(pos+i) % len(buffer)]`, correctly handling records that span the end/beginning of the cyclic buffer. Our parser has no wrap-around logic.

**3. DailyPresenceCounter is BCD-encoded, not plain uint16**

The reference decodes `dailyPresenceCounter` as a BCD string (`UnmarshalBcdString`). Our parser reads it as a plain `uint16`. This doesn't affect the number of records found but produces incorrect counter values.

**4. ActivityChangeInfo filtering**

The reference skips entries where `changeData == 0` or `changeData == 0xFFFF` (invalid/padding entries). Our parser only skips entries where `minutes >= 1440` but processes 0x0000 entries as valid (slot=0, activity=0, minutes=0).

### Plan

**File: `src/lib/ddd-parser.ts`**

1. **Implement cyclic buffer iterator in `parseActivities`**:
   - Read 4-byte header: `oldestDayRecordPointer` + `newestDayRecordPointer`
   - Start at `newestDayRecordPointer` position in the remaining buffer
   - For each record: read `previousRecordLength` (2B) + `recordLength` (2B), extract record bytes with wrap-around (`buffer[(pos+i) % bufferLen]`)
   - Parse each record: `date`(4B) + `dailyPresenceCounter`(2B) + `dayDistance`(2B) + `activityChangeInfo[N]` where N = remaining / 2
   - Follow linked list backward: `nextPos = (currentPos - previousRecordLength + bufferLen) % bufferLen`
   - Stop when `previousRecordLength == 0` (oldest record) or `recordLength == 0` or max 366 iterations
   - Reverse results to get chronological order

2. **Fix ActivityChangeInfo filtering**: Skip words `0x0000` and `0xFFFF` (padding/invalid) before parsing slot/activity/minutes bits.

3. **Update `parseRawActivitiesFile`**: Apply the same 0x0000/0xFFFF skip for consistency.

4. **Keep existing `parseActivitiesFromSections` and fallback strategies** unchanged — the cyclic iterator fix goes into `parseActivities` which they already call.

5. **Update tests**: Verify distance diversity and record count remain correct.

### Technical details

```text
CardDriverActivity layout:
┌──────────────────────────────────┐
│ oldestDayRecordPointer  (2B)     │  ← offset into cyclic buffer
│ newestDayRecordPointer  (2B)     │  ← start traversal here
├──────────────────────────────────┤
│ activityDailyRecords (cyclic)    │
│  ┌─────────────────────────────┐ │
│  │ prevRecordLength   (2B)     │ │  ← linked list pointer (backward)
│  │ recordLength        (2B)    │ │
│  │ activityRecordDate  (4B)    │ │
│  │ dailyPresenceCounter(2B BCD)│ │
│  │ activityDayDistance  (2B)   │ │
│  │ activityChangeInfo[N](N×2B) │ │
│  └─────────────────────────────┘ │
│  ... (next record wraps around)  │
└──────────────────────────────────┘

Traversal: start at newest, follow prevRecordLength backward
with wrap: pos = (pos - prevLen + bufLen) % bufLen
```

