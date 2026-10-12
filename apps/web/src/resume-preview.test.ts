import { describe, expect, it } from 'vitest';
import { educationSchema } from '@career/shared';
import { previewResume } from './resume-preview';

describe('resume preview extraction', () => {
  it('extracts contact details, links, education, grade, and skills as reviewable suggestions', () => {
    const result = previewResume(`Alex River
alex@example.com | +1 555-123-4567
https://linkedin.com/in/alex-river

Education
B.Tech Computer Science, State University, 2020 - 2024, CGPA 8.6

Skills
TypeScript, React, PostgreSQL`);
    expect(result.profile).toMatchObject({ fullName: 'Alex River', email: 'alex@example.com', phone: '+1 555-123-4567' });
    expect(result.entries.some(entry => entry.section === 'links' && 'label' in entry.input && entry.input.label === 'LinkedIn')).toBe(true);
    const education = result.entries.find(entry => entry.section === 'education');
    expect(education && 'qualificationType' in education.input && education.input.qualificationType).toBe('Bachelor’s');
    expect(education && 'cgpa' in education.input && education.input.cgpa).toBe(8.6);
    expect(result.entries.some(entry => entry.section === 'skills' && 'label' in entry.input && entry.input.label === 'React')).toBe(true);
  });

  it('does not accept both percentage and CGPA', () => {
    expect(educationSchema.safeParse({ qualificationType: '12th/HSC', institution: 'School', board: 'CBSE', specialization: '', startDate: '', endDate: '', passingYear: 2020, percentage: 88, cgpa: 8.8, url: '', position: 0 }).success).toBe(false);
  });
});
