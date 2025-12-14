# Run Tests

Run tests for the specified module or the entire test suite.

## Target
$ARGUMENTS

## Instructions

1. If a specific module is provided, run tests for that module:
   ```bash
   pytest tests/ -k "$ARGUMENTS" -v
   ```

2. If no argument provided, run the full test suite:
   ```bash
   pytest tests/ -v
   ```

3. Report results clearly:
   - Number of tests passed/failed
   - Any failures with brief explanation
   - Suggestions for fixing failures if any

4. If tests fail, investigate the cause and suggest fixes.
