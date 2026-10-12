ALTER TABLE application_events DROP CONSTRAINT IF EXISTS events_kind;
ALTER TABLE application_events ADD CONSTRAINT events_kind CHECK(kind IN ('created','updated','stage_changed','submission_confirmed'));
