# Zero-question vocabulary modes

## Intent and scope
Administrators can omit 객관식 (2), 스펠링 (3), or 통합 (4) by entering 0 questions. Preserve explicit zero on save/edit; blank retains the existing 40-question default. Require at least one active ordinary mode; positive counts remain integers 5–200. English-definition-only tests retain their existing behavior.

## Approaches
Chosen: preserve zero in existing `vocabQuestionCounts` and derive active modes consistently. A separate exclusion flag would duplicate the same configuration and risk disagreement. Omitting count keys cannot distinguish exclusion from legacy/default counts.

## Behavior
Hide omitted test buttons, reject direct attempts, skip excluded prerequisite stages, and calculate cutoff summaries and final PASS from active modes only. Excluded historical results do not affect displayed scores or completion.

Weekly review retains only CHOICE and SPELLING, with no new integrated review mode. Ignore results from omitted source directions. Correct-word sampling must use a mode supported by that word's actual source results (2 → CHOICE, 3/5 → SPELLING, 4 → either); retain existing integrated mistake handling. Excluded integrated history cannot block weekly completion. Previously frozen/submitted weekly reviews are not rewritten.

## Constraints
Use existing static JavaScript architecture, no dependencies or database migration. Preserve legacy tests lacking counts, existing results, unrelated local files, and English-definition-only behavior. Test, commit, and publish through the existing repository deployment.
