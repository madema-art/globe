# HISTOGRAPHY library expansion report

The collection now contains **51 mysteries and 255 clues**. This milestone adds **24 geography mysteries and 120 individually authored bilingual clue pairs** while preserving all 27 earlier canonical records and English localizations. The 24 additions are all geography; no historical records were removed or reclassified to create balance.

| Measure | Before | After |
| --- | ---: | ---: |
| Mysteries | 27 | 51 |
| Five-clue sequences | 27 | 51 |
| Clues in either supported locale | 135 | 255 |
| History | 22 | 22 |
| Geography | 5 | 29 |
| Source references | 27 | 53 |
| Distinct source URLs | 27 | 53 |
| Independently reviewed | 0 | 0 |
| Approved for production | 0 | 0 |

The additions cover mountain landscapes, lakes, river sections and deltas, canyons, caves/karst, coastal formations, deserts, wetlands, rainforests, volcanic islands, glaciers and icefjords. Several records deliberately connect geology with evolution, culture or scientific research. Overlapping natural themes support variety selection, and an explicit relationship connects two distinct but scientifically related destinations. This is not exhaustive coverage of every requested feature type; future batches should add straits, peninsulas, additional river systems and less represented ecosystems.

## Geographic distribution

Polar/subantarctic properties are grouped separately below rather than counted twice under administering countries or continental geology.

| Broad region | Before | Added | Total |
| --- | ---: | ---: | ---: |
| Africa | 5 | 4 | 9 |
| Asia | 8 | 4 | 12 |
| Europe | 1 | 5 | 6 |
| North and Central America | 7 | 3 | 10 |
| South America | 2 | 4 | 6 |
| Oceania | 4 | 1 | 5 |
| Polar and subantarctic | 0 | 3 | 3 |

The CLI further distinguishes 17 regions: South Asia 6, Central America 3, West Asia 2, East Asia 1, Southern Africa 2, West Africa 1, North Africa 2, South America 6, North America 7, Central Africa 1, Oceania 5, Europe 6, East Africa 3, Southeast Asia 2, North Asia 1, Subantarctic 2 and Arctic 1. These are selection groupings, not a geopolitical naming policy.

## Era distribution

| Era grouping | Total |
| --- | ---: |
| Bronze Age | 1 |
| Classical | 6 |
| Medieval | 5 |
| Early modern | 3 |
| Nineteenth century | 1 |
| Twentieth century | 2 |
| Multiple eras | 3 |
| Living traditions | 2 |
| Not applicable | 28 |

The 24 new physical-geography records use `not-applicable` rather than imposing a human historical era on a natural feature. Their required date field explicitly records a sourced heritage-recognition year, **not** the feature’s formation age. The historical distribution is unchanged. Future history batches can add biographies, science, arts, philosophy, engineering, Indigenous achievements and contemporary developments without undoing the improved geography coverage.

## Category distribution

| Category | Total |
| --- | ---: |
| Built site | 2 |
| Settlement | 5 |
| Civilization | 3 |
| Culture | 6 |
| Science | 2 |
| Event | 1 |
| Historical process | 4 |
| Natural feature | 28 |

## Evidence and editorial limits

Every added clue and explanation has source references. The new batch adds 26 references to 26 distinct accessible official URLs: 24 UNESCO listings plus supporting US National Park Service and Australian Antarctic Division material. Published property reference coordinates were read and converted from degrees/minutes/seconds; none were invented, inferred from a remembered location or presented as survey-accurate entrances. Large natural features identify a designated protected property or section, with an explicit explanation that the target is its representative point rather than a uniquely correct point for the entire feature. Moving ice fronts are not treated as fixed coordinates.

Japanese canonical text and English localization were individually authored and checked against the captured evidence. Older or rapidly changing numerical claims were avoided where they would imply current precision. Both locales retain uncertainty and recognition-date context. This authoring/source-check pass does not constitute independent editorial review, proof of every inference, or validated subjective clue difficulty. All **51 remain source-checked, with zero independent reviews and zero approvals**. Editors should corroborate specialized claims, assess geographical identifiability, verify every clue’s progression and English fluency, and broaden source institutions in later batches.

Normal production publication still produces an empty catalog. An explicitly enabled development channel can now publish all 51 provisional records for internal integration and automated gameplay. It retains unapproved flags, uses a separate release pointer/history ledger and progress namespace, and is rejected by the default runtime loader. It never creates reviewer attestations. See [the integration contract](LIBRARY_INTEGRATION.md).

## Validation and delivery

Automated checks cover preservation of all 54 original content files, separate channels and storage, refusal of disguised development catalogs, incomplete-draft exclusion, cancellation of stale input and navigation, all-record provisional gameplay/exhaustion, and the existing 10,000-record synthetic stress case. Ordinary content reports contain only counts and fixed codes. No actual answers, clues or target coordinates belong in reports, PR descriptions or commit messages.

This work is based on PR #5 while PRs #3 and #5 remain unmerged. The expansion PR targets `codex/mystery-library`, preserving the stack. No merge is authorized. Visuals and launcher/update infrastructure are unchanged; Claude owns all visual integration. Repository paths and package identity remain `globe`; the documented working title is HISTOGRAPHY with no tagline or subtitle.

Local Windows validation: **87 tests passed**, including all existing tests, the 10,000-entry synthetic catalog and automated gameplay through all 51 provisional records. Content validation reports zero failures and zero heuristic warnings. Production publication includes zero unapproved records; explicit development publication includes 51. Production build and immutable build-publication safety checks pass. Existing CI additionally exercises the unchanged browser/service foundation.
