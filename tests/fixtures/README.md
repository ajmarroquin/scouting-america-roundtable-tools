# Test fixtures

Everything here is made up. Never add a real export, even a trimmed one.

`roster-export-sample.csv` copies the exact 90-column header of Scouting America's "all registered people" roster export, with synthetic rows that cover:

- one adult on two rows (same member ID, two units, status `Multiple`)
- email only in the `Email` column instead of `EmailHome`
- two people sharing one family email
- a legal first name with a different preferred name in `CommonName`
- a youth row flagged by `IsYouth = 1`
- a 19-year-old Venturer with `IsYouth` blank and no position (still youth)
- district positions with no unit (Merit Badge Counselor, Unit Commissioner)
- an adult in a different district
- an unpaid registration with no email
- sensitive columns filled in (birthdate, age, ethnicity, school) that the parser must never read
- mixed date formats (`MM-DD-YY` and `M/D/YYYY`) and zero-padded unit names
- a UTF-8 byte-order mark and a truncated last row

Names use obviously fake surnames, emails use `example.*` domains, and phone numbers use the reserved 555-01xx range.
