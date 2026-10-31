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

`attendance-sheet-sample.csv` copies the shape of the old Google Sheets attendance log (Name, Unit, an unnamed column, Position, then one column per month like "Nov 25"), with made-up people who line up with the roster fixture. It covers:

- a unit written as "Troop 101 b, g" and as "crew 205/commissioner"
- a nickname (Jim for James), a first name alone (Jordan), and a typo (Nomial for Nomail)
- someone who isn't in the roster at all, in a unit the app doesn't know
- the same person on two rows
- months with nobody in them (cancelled), a blank row, and a total row
