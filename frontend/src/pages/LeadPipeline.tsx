import Card from '../components/ui/Card';

function LeadPipeline() {
  return (
    <div className="grid gap-2">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#111827]">Lead Pipeline</h2>
        <p className="mt-1 text-sm text-[#4B5768]">Track leads as they move from discovery to proposal across your pipeline stages.</p>
      </div>

      <Card className="mt-4 min-h-[480px]" />
    </div>
  );
}

export default LeadPipeline;