import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui';
import { CtcFields, type CtcKey } from './CtcFields';
import type { CandidateFormState } from './candidateForm';

export interface CandidateFormFieldsProps {
  form: CandidateFormState;
  set: <K extends keyof CandidateFormState>(key: K, value: string) => void;
  errors?: Partial<Record<keyof CandidateFormState, string>>;
}

/**
 * The full editable candidate field set (personal, experience, CTC, notice).
 * Shared by the profile edit panel and the resume-capture add flow.
 */
export function CandidateFormFields({ form, set, errors = {} }: CandidateFormFieldsProps) {
  const setCtc = (key: CtcKey, value: string) => set(key, value);

  return (
    <div className="space-y-5">
      <FieldGroup title="Personal">
        <Input
          label="Full name *"
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          error={errors.full_name}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
        />
        <Input
          label="Mobile"
          value={form.mobile}
          onChange={(e) => set('mobile', e.target.value)}
        />
        <Input
          label="Current location"
          value={form.current_location}
          onChange={(e) => set('current_location', e.target.value)}
          leftIcon={<MapPin className="h-4 w-4" />}
        />
        <div className="sm:col-span-2">
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </div>
      </FieldGroup>

      <FieldGroup title="Experience & education">
        <Input
          label="Total experience (yrs)"
          type="number"
          min={0}
          step="0.5"
          value={form.total_experience_years}
          onChange={(e) => set('total_experience_years', e.target.value)}
        />
        <Input
          label="Relevant experience (yrs)"
          type="number"
          min={0}
          step="0.5"
          value={form.relevant_experience_years}
          onChange={(e) => set('relevant_experience_years', e.target.value)}
        />
        <Input
          label="Current company"
          value={form.current_company}
          onChange={(e) => set('current_company', e.target.value)}
        />
        <Input
          label="Current designation"
          value={form.current_designation}
          onChange={(e) => set('current_designation', e.target.value)}
        />
        <Input
          label="Highest qualification"
          value={form.highest_qualification}
          onChange={(e) => set('highest_qualification', e.target.value)}
        />
      </FieldGroup>

      <div>
        <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-label">
          Compensation (CTC · LPA)
        </p>
        <CtcFields
          values={{
            current_ctc_fixed: form.current_ctc_fixed,
            current_ctc_variable: form.current_ctc_variable,
            expected_ctc_fixed: form.expected_ctc_fixed,
            expected_ctc_variable: form.expected_ctc_variable,
          }}
          onChange={setCtc}
        />
      </div>

      <FieldGroup title="Notice (HR)">
        <Input
          label="Notice period (days)"
          type="number"
          min={0}
          value={form.notice_period_days}
          onChange={(e) => set('notice_period_days', e.target.value)}
        />
        <Input
          label="Last working day"
          type="date"
          value={form.last_working_day}
          onChange={(e) => set('last_working_day', e.target.value)}
        />
      </FieldGroup>
    </div>
  );
}

function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-label">{title}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
