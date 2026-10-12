CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, full_name text NOT NULL, password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE profiles (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 full_name text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', headline text NOT NULL DEFAULT '', summary text NOT NULL DEFAULT '', location text NOT NULL DEFAULT ''
);
-- Distinct, normalized section tables: arbitrary JSON is never the career source of truth.
CREATE TABLE education (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 label text NOT NULL, organization text NOT NULL DEFAULT '', description text NOT NULL DEFAULT '',
 start_date date, end_date date, url text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0 CHECK(position>=0),
 source text NOT NULL DEFAULT 'user' CHECK(source='user'), verified boolean NOT NULL DEFAULT true CHECK(verified),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id),
 CHECK(end_date IS NULL OR start_date IS NULL OR end_date>=start_date)
);
CREATE INDEX education_owner_order ON education(user_id,position,created_at);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['experience','projects','skills','certifications','achievements','links'] LOOP
 EXECUTE format('CREATE TABLE %I (LIKE education INCLUDING ALL)',t);
 EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE',t);
 END LOOP; END $$;
CREATE TABLE refresh_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 family_id uuid NOT NULL, token_hash text NOT NULL UNIQUE, client text NOT NULL CHECK(client IN ('web','extension')),
 expires_at timestamptz NOT NULL, used_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_owner ON refresh_tokens(user_id);
CREATE INDEX refresh_family ON refresh_tokens(family_id);
CREATE TABLE resumes (id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,id));
CREATE TABLE resume_versions (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,resume_id uuid NOT NULL,
 name text NOT NULL,filename text NOT NULL,mime_type text NOT NULL CHECK(mime_type IN ('text/plain','application/pdf')),
 size integer NOT NULL CHECK(size>0 AND size<=5242880),content bytea NOT NULL,extracted_text text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,id),FOREIGN KEY(user_id,resume_id) REFERENCES resumes(user_id,id) ON DELETE CASCADE
);
CREATE INDEX resume_versions_owner ON resume_versions(user_id,resume_id);
CREATE TABLE jobs (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,title text NOT NULL,company text NOT NULL DEFAULT '',
 location text NOT NULL DEFAULT '',url text NOT NULL DEFAULT '',description text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,id)
);
CREATE INDEX jobs_owner ON jobs(user_id,created_at DESC);
CREATE TABLE analyses (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,job_id uuid NOT NULL,data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,job_id),FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE
);
CREATE TABLE applications (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,job_id uuid NOT NULL,resume_version_id uuid,
 stage text NOT NULL CHECK(stage IN ('Saved','Preparing','Applied','Screening','Interview','Offer','Rejected','Withdrawn')),
 notes text NOT NULL DEFAULT '',applied_at date,follow_up_at date,interview_at date,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,id),
 FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,resume_version_id) REFERENCES resume_versions(user_id,id) ON DELETE SET NULL (resume_version_id)
);
CREATE INDEX applications_owner ON applications(user_id,created_at DESC);
CREATE INDEX applications_job ON applications(user_id,job_id);
CREATE INDEX applications_resume ON applications(user_id,resume_version_id);
CREATE TABLE application_events (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,application_id uuid NOT NULL,
 kind text NOT NULL,from_stage text,to_stage text,note text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE CASCADE
);
CREATE INDEX events_owner ON application_events(user_id,application_id,created_at);
CREATE TABLE interview_preps (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,application_id uuid NOT NULL,data jsonb NOT NULL,
 notes text NOT NULL DEFAULT '',completed boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(user_id,application_id),
 FOREIGN KEY(user_id,application_id) REFERENCES applications(user_id,id) ON DELETE CASCADE
);
CREATE TABLE drafts (
 id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,job_id uuid,question text NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(user_id,job_id) REFERENCES jobs(user_id,id) ON DELETE SET NULL (job_id)
);
CREATE INDEX drafts_owner ON drafts(user_id,created_at);
