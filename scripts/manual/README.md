# Manual dev scripts (legacy)

These were ad-hoc scripts that lived inside `app/` with `test_` names, which
made them look like the automated test suite. They are NOT run by pytest
(`pytest.ini` points at `tests/`). Several of them predate the Supabase move
and still read from Redis Streams; events now live in the `pipeline_events`
table. Keep them as reference or delete them - the real tests are in `tests/`.

Run one from the project root, e.g.:

    python -m scripts.manual.test_full_pipeline
