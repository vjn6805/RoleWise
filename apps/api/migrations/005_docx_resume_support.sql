ALTER TABLE resume_versions DROP CONSTRAINT IF EXISTS resume_versions_mime_type_check;
ALTER TABLE resume_versions ADD CONSTRAINT resume_versions_mime_type_check CHECK(mime_type IN ('text/plain','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
