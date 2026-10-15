import { memo } from 'react';
import { motion } from 'framer-motion';
import { ArrowTrendingUpIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { SECTOR_PROFILES } from '../../constants/dashboard';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import ProgressBar from '../ui/ProgressBar';
import { riskTone } from '../../utils/formatters';

function SectorResearchGrid({ activeKey, disabled, onAnalyze }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {Object.entries(SECTOR_PROFILES).map(([sector, profile], index) => (
        <motion.div
          key={sector}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.03 }}
        >
          <Card interactive className="flex h-full flex-col p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
                <ArrowTrendingUpIcon className="h-5 w-5" />
              </div>
              <Badge tone={riskTone(profile.risk)}>{profile.risk}</Badge>
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-950">{sector}</h3>
            <p className="mt-2 text-sm font-medium text-slate-500">{profile.focus}</p>
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                <span>Growth</span>
                <span>{profile.score}</span>
              </div>
              <ProgressBar value={profile.score} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.signals.slice(0, 3).map((signal) => (
                <Badge key={signal}>{signal}</Badge>
              ))}
            </div>
            <Button
              type="button"
              className="mt-auto w-full"
              disabled={disabled}
              onClick={() => onAnalyze(sector)}
            >
              <SparklesIcon className="h-4 w-4" />
              {activeKey === `sector:${sector}` ? 'Analyzing' : 'Analyze Sector'}
            </Button>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}

export default memo(SectorResearchGrid);
