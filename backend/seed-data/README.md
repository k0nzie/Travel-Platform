# Reference data (GEN-12)

The official course datasets. They are used during the final evaluation, so keep the records
and identifiers exactly as provided.

| File | Columns | Stored as |
|---|---|---|
| Countries.csv | code, name, currency | `countries` (`code`), and the supported `currencies` = the currency codes |
| Cities.csv | city_id, name, country_code | `cities` (`code` = city_id) |
| Airports.csv | iata_code, name, city_id, country_code, time_zone | `airports` (`iataCode`, IANA `timezone`) |
| Attractions.csv | attraction_id, name, city_id | `attractions` (`code` = attraction_id) |

```bash
npm run seed              # upserts; safe to rerun
npm run seed -- --replace # first removes reference records that are not in these files
```

Other modules refer to these records by their official ids (`EG`, `cairo`, `CAI`, `att-1`);
`ReferenceDataService.resolveCity / resolveAirport / resolveAttraction` accept those or a Mongo `_id`.
