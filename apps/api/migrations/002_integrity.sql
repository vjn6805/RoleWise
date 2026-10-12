-- Defense in depth for writes made outside the HTTP validation boundary.
ALTER TABLE users ADD CONSTRAINT users_normalized_email CHECK(email=lower(btrim(email)) AND length(email) BETWEEN 3 AND 254);
ALTER TABLE users ADD CONSTRAINT users_name_length CHECK(length(full_name) BETWEEN 1 AND 160);
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_hash_format CHECK(token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE refresh_tokens ADD CONSTRAINT refresh_expiry CHECK(expires_at>created_at);
ALTER TABLE resume_versions ADD CONSTRAINT resume_content_size CHECK(octet_length(content)=size);
ALTER TABLE resume_versions ADD CONSTRAINT resume_text_limit CHECK(length(extracted_text)<=100000);
ALTER TABLE resumes ADD CONSTRAINT resume_name_length CHECK(length(name) BETWEEN 1 AND 200);
ALTER TABLE jobs ADD CONSTRAINT jobs_title_length CHECK(length(title) BETWEEN 1 AND 200);
ALTER TABLE jobs ADD CONSTRAINT jobs_description_length CHECK(length(description) BETWEEN 20 AND 50000);
ALTER TABLE application_events ADD CONSTRAINT events_kind CHECK(kind IN ('created','updated','stage_changed'));
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['education','experience','projects','skills','certifications','achievements','links'] LOOP
 EXECUTE format('ALTER TABLE %I ADD CHECK(length(label) BETWEEN 1 AND 200), ADD CHECK(position<=10000), ADD CHECK(length(description)<=6000)',t);
 END LOOP; END $$;
