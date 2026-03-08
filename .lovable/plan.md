

## Analysis: Remaining 768 km artifacts from chunk boundary corruption

### Root Cause

The activities file contains multiple `0x76 0x32` TLV sections — each is a TRTP transport chunk of the card's single `CardDriverActivity` cyclic buffer. When a daily record straddles two chunks, both parsing strategies fail:

- **Strategy A (per-section)**: Parses each chunk independently. A record split across two chunks produces a truncated record in one chunk and garbage at the start of the next → 768 km artifacts from misaligned reads.
- **Strategy B (concatenated)**: Strips TRTP prefixes and joins chunks. This is correct *in principle*, but the prefix detection (`04 00 01`) is fragile — if any chunk has a different prefix format or no prefix, the concatenated buffer has extra bytes at that boundary, corrupting records that span it.

### Evidence

The value 768 = `0x0300` is the `previousRecordLength` or `recordLength` field of a neighboring record being read as `dayDistance` — a classic 2-byte alignment error at a chunk seam.

### Plan

**File: `src/lib/ddd-parser.ts`**

1. **Always prefer concatenated strategy for activities** — remove the per-section vs concatenated competition. Per-section parsing of a split cyclic buffer is fundamentally wrong (records can span chunk boundaries). Keep per-section only as a last-resort fallback if concatenated yields 0 results.

2. **Improve TRTP prefix stripping with multi-pattern detection**:
   - Pattern 1: `04 00 01 XX XX` (5 bytes) — current detection
   - Pattern 2: `04 00 02 XX XX` (5 bytes) — variant seen in some VU firmware
   - Pattern 3: No prefix (raw data continuation) — first chunk typically has no TRTP prefix since it starts with the cyclic buffer header (`oldestPtr + newestPtr`)
   - Heuristic: For the **first chunk only**, check if bytes 0-3 look like a valid cyclic header (two uint16 pointers both < chunk length). If so, don't strip anything. For subsequent chunks, always strip TRTP prefix if detected.

3. **Add chunk boundary validation**: After concatenation, verify the cyclic buffer header integrity — `oldestPtr` and `newestPtr` must be within bounds of the concatenated body. Log a warning if they're not.

4. **Update test**: Assert that no record has `dayDistance === 768` (the known artifact value).

### Technical Detail

```text
DDD file layout for activities:
┌─────────────────────────────────┐
│ 0x76 0x32 [len] [chunk 1 data] │  ← may or may not have TRTP prefix
│ 0x76 0x32 [len] [chunk 2 data] │  ← usually has 04 00 01 XX XX prefix  
│ 0x76 0x32 [len] [chunk 3 data] │  ← same
│ ...                             │
└─────────────────────────────────┘

After correct stripping & concatenation:
┌──────────────────────────────────────┐
│ oldestPtr(2B) newestPtr(2B)          │  ← cyclic header
│ cyclicBody[0..N-1]                   │  ← seamless daily records
└──────────────────────────────────────┘
```

The fix ensures chunk seams are invisible to the cyclic buffer parser, eliminating the 768 km boundary artifacts.

