ALTER TABLE education DROP CONSTRAINT IF EXISTS education_label_check;
ALTER TABLE education DROP CONSTRAINT IF EXISTS education_description_check;
ALTER TABLE education RENAME COLUMN organization TO institution;
ALTER TABLE education DROP COLUMN label;
ALTER TABLE education DROP COLUMN description;
ALTER TABLE education
  ADD COLUMN qualification_type text NOT NULL DEFAULT 'Other',
  ADD COLUMN board text NOT NULL DEFAULT '',
  ADD COLUMN specialization text NOT NULL DEFAULT '',
  ADD COLUMN passing_year integer,
  ADD COLUMN percentage numeric(5,2),
  ADD COLUMN cgpa numeric(4,2);
ALTER TABLE education ADD CONSTRAINT education_qualification_type CHECK (qualification_type IN ('10th','12th/HSC','Diploma','Certificate','Associate','Bachelor’s','Master’s','Doctorate','College','Other'));
ALTER TABLE education ADD CONSTRAINT education_passing_year CHECK (passing_year IS NULL OR passing_year BETWEEN 1900 AND 2100);
ALTER TABLE education ADD CONSTRAINT education_percentage CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100));
ALTER TABLE education ADD CONSTRAINT education_cgpa CHECK (cgpa IS NULL OR (cgpa >= 0 AND cgpa <= 10));
ALTER TABLE education ADD CONSTRAINT education_one_grade CHECK (percentage IS NULL OR cgpa IS NULL);
