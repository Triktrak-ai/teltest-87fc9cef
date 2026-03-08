

## Problem

The `parseCardPlaces` function uses the same Gen1 record structure (9 bytes: 4B timestamp + 1B country + 1B region + 3B odometer) for both Gen1 (`0x0506`) and Gen2v2 (`0x0526`) tags. However, Gen2v2 `CardPlaceAuthDailyWorkPeriod` records have a larger structure that includes GNSS place authentication data (12 bytes extra), causing misaligned reads and corrupted country/region/odometer values.

## Gen2v2 CardPlaceAuthDailyWorkPeriod record structure (Appendix 7)

```text
Gen1  (0x0506): entryTime(4B) + country(1B) + region(1B) + odometer(3B)                        = 9B
Gen2v2(0x0526): entryTime(4B) + country(1B) + region(1B) + odometer(3B) + gnssPlaceAuth(12B)    = 21B
```

The `gnssPlaceAuth` is a `GnssPlaceAuthRecord`: timestamp(4B) + accuracy(1B) + lat(3B) + lon(3B) + auth(1B) = 12B.

## Plan

### 1. Update `parseCardPlaces` to accept a generation flag

Pass the tag type from the switch-case so the parser knows the record size:
- Gen1 (`0x0506`): 9B records, parse as today
- Gen2v2 (`0x0526`): 21B records, parse 9B base + 12B `GnssPlaceAuthRecord`

### 2. Extend `CardPlaceRecord` interface

Add optional `gnssPlace?: GnssPlaceAuthRecord` field to carry GNSS coordinates when available.

### 3. Update the call site

```
case 0x0506:
  result.places = parseCardPlaces(sectionData, false);
case 0x0526:
  result.places = parseCardPlaces(sectionData, true);
```

### 4. Update DddReader.tsx places table

Add optional GNSS coordinate columns (lat/lon) when data is present, so Gen2v2 places show location.

