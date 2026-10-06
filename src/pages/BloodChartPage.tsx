import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { useReport } from '../store/hooks';
import { useUi } from '../store/ui';
import { FilterBar } from '../components/FilterBar';
import { BloodChart } from '../components/BloodChart';
import { ExercisePicker } from '../components/ExercisePicker';
import { PageHeader, toast } from '../components/ui';
import { periodLabel } from '../lib/report';

export default function BloodChartPage() {
  const report = useReport();
  const exerciseId = useUi((s) => s.exerciseId);
  const [busy, setBusy] = useState(false);

  if (!exerciseId || !report)
    return (
      <>
        <PageHeader title="Blood Chart" subtitle="Choose an exercise to see every dealer's answer to every question." />
        <ExercisePicker />
      </>
    );

  const exportXlsx = async () => {
    setBusy(true);
    try {
      const { exportExcel } = await import('../lib/exports');
      const r = await exportExcel(report, { bloodChartOnly: true });
      if (r === 'failed') toast('The export could not be saved.', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow={report.oem?.name}
        title="Blood Chart"
        subtitle={`${report.exercise.name} · ${periodLabel(report.exercise)} · ${report.visits.length} visit${report.visits.length === 1 ? '' : 's'}`}
        actions={
          <button className="btn-secondary" onClick={exportXlsx} disabled={busy}>
            <FileSpreadsheet size={16} /> {busy ? 'Preparing' : 'Export to Excel'}
          </button>
        }
      />
      <FilterBar excludedInProgress={report.excludedInProgress} />
      <BloodChart report={report} />
    </>
  );
}
