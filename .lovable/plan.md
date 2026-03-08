

## Fix: `recordLength` includes the 4-byte header

### Root Cause

The `tachograph-go` reference confirms that `activityRecordLength` includes the 4-byte header (`previousRecordLength` + `recordLength` fields themselves). Our parser treats it as body-only, causing:

1. **4-byte overshoot per record**: `r.position = recordStart + 4 + recLen` jumps 4 bytes past the next record's start
2. **Activity count off by 2**: `N = (recLen - 8) / 2` should be `N = (recLen - 12) / 2`
3. **Cascading misalignment**: After the first record, every subsequent record reads from a wrong offset, producing the repeated 768 km values

### Evidence from reference

```go
// cyclicRecordIterator.Next() — reads recordLength bytes FROM currentPos (includes header)
it.recordBytes = make([]byte, currentRecordLength)
for i := 0; i < currentRecordLength; i++ {
    it.recordBytes[i] = it.buffer[(it.currentPos+i)%len(it.buffer)]
}

// parseSingleActivityDailyRecord — header is INSIDE the recordBytes
prevRecordLength := binary.BigEndian.Uint16(data[0:2])   // offset 0
currentRecordLength := binary.BigEndian.Uint16(data[2:4]) // offset 2
// date at offset 4, counter at 8, distance at 10
```

### Changes in `src/lib/ddd-parser.ts`

**1. `parseCyclicActivities`** (line ~2300):
- Read full record as `recLen` bytes from `pos` (not `pos + 4`)
- Date at body[4], counter at body[8], distance at body[10]
- `N = (recLen - 12) / 2`

**2. `parseActivitiesForward`** (line ~2380):
- Change advance to `r.position = recordStart + recordLength` (not `+ 4 + recordLength`)
- `N = (recordLength - 12) / 2`
- Update validation: `(recLen - 12) % 2 === 0` and `recLen >= 12`

**3. Cyclic header detection** (line ~2258):
- Adjust validation: `recLen >= 12` instead of `>= 8`
- Timestamp at `newestAbsPos + 4` (unchanged, since header is at pos and recLen read at pos+2)

Wait — the header detection reads timestamp at `newestAbsPos + 4` which is correct (prevLen=2 + recLen=2 + date starts at +4). But `recLen` validation should check `>= 12`.

**4. Test**: existing regression test already checks for diverse distances.

