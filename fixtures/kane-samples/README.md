# Kane samples

`*.synthetic.ndjson` files are **synthetic**: hand-written from the documented kane-cli 0.10.0 `testrun run --agent`
event shapes (skill reference `testrun.md` / `parsing.md`), not captured from a real run. They exist so Bugsy's
parser can be tested without spending credits. Replace them with real captures from C1 (Bugsy saves every run's raw
stdout to `bugsy/.run/<phase>-<timestamp>.ndjson`); keep the synthetic ones or delete them once real ones exist.

The `kanehack_report` line at the end of the failing sample stands in for the extra line `kanehack report` prints;
its real shape is unknown, the parser only has to tolerate it.
