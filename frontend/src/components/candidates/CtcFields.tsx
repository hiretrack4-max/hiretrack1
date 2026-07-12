import { TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  ctcTotal,
  formatLpa,
  hikePercent,
  parseLpaInput,
} from '@/lib/salary';

export type CtcKey =
  | 'current_ctc_fixed'
  | 'current_ctc_variable'
  | 'expected_ctc_fixed'
  | 'expected_ctc_variable';

export interface CtcFieldsProps {
  values: Record<CtcKey, string>;
  onChange: (key: CtcKey, value: string) => void;
}

/**
 * Current + Expected CTC entry (all in LPA). Fixed/Variable auto-detect
 * rupees->lakhs; Total is read-only and live; Expected shows the live hike %.
 */
export function CtcFields({ values, onChange }: CtcFieldsProps) {
  const currentTotal = ctcTotal(values.current_ctc_fixed, values.current_ctc_variable);
  const expectedTotal = ctcTotal(values.expected_ctc_fixed, values.expected_ctc_variable);
  const hike = hikePercent(currentTotal, expectedTotal);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <CtcGroup
        title="Current CTC"
        total={currentTotal}
        fixedKey="current_ctc_fixed"
        variableKey="current_ctc_variable"
        values={values}
        onChange={onChange}
      />
      <CtcGroup
        title="Expected CTC"
        total={expectedTotal}
        fixedKey="expected_ctc_fixed"
        variableKey="expected_ctc_variable"
        values={values}
        onChange={onChange}
        hike={hike}
      />
    </div>
  );
}

function CtcGroup({
  title,
  total,
  fixedKey,
  variableKey,
  values,
  onChange,
  hike,
}: {
  title: string;
  total: number | null;
  fixedKey: CtcKey;
  variableKey: CtcKey;
  values: Record<CtcKey, string>;
  onChange: (key: CtcKey, value: string) => void;
  hike?: number | null;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Wallet className="h-4 w-4 text-brand-500" />
          {title}
        </p>
        {hike !== undefined && hike !== null && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
              hike >= 0
                ? 'bg-status-joined/12 text-status-joined'
                : 'bg-status-rejected/12 text-status-rejected',
            )}
          >
            {hike >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {hike >= 0 ? '+' : ''}
            {hike}% hike
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CtcInput
          label="Fixed"
          value={values[fixedKey]}
          onChange={(v) => onChange(fixedKey, v)}
        />
        <CtcInput
          label="Variable"
          value={values[variableKey]}
          onChange={(v) => onChange(variableKey, v)}
        />
      </div>

      <div className="mt-3">
        <p className="mb-1.5 block text-sm font-medium text-ink">Total</p>
        <div className="flex h-11 items-center justify-between rounded-xl border border-brand-400/40 bg-brand-500/8 px-3.5 text-sm font-semibold text-ink">
          <span>{formatLpa(total)}</span>
          <span className="text-2xs font-medium uppercase tracking-wide text-muted">
            auto
          </span>
        </div>
      </div>
    </div>
  );
}

function CtcInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const raw = value.trim();
  const rawNum = raw === '' ? NaN : Number(raw);
  const normalized = parseLpaInput(value);
  // Hint only when the entry was auto-converted from rupees (i.e. >= 1,00,000).
  const converted =
    Number.isFinite(rawNum) && Math.abs(rawNum) >= 100000 && normalized !== null;

  return (
    <div>
      <Input
        label={label}
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const n = parseLpaInput(value);
          if (n !== null) onChange(String(n));
        }}
        rightIcon={<span className="text-2xs font-semibold text-muted">LPA</span>}
        placeholder="0"
      />
      {converted && (
        <p className="mt-1 text-2xs text-brand-600 dark:text-brand-300">
          Detected ₹ — saved as {formatLpa(normalized)}
        </p>
      )}
    </div>
  );
}
