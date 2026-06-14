/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useTranslation } from 'react-i18next'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TimeSlotStats } from '../types'
import { getStatusColor, formatTime } from '../lib/utils'

interface StatusTimelineProps {
  timeline: TimeSlotStats[]
}

export function StatusTimeline({ timeline }: StatusTimelineProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{t('24h ago')}</span>
        <span>{t('Now')}</span>
      </div>
      <div className="grid grid-cols-48 gap-0.5 h-8">
        {timeline.map((slot, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'h-full rounded-sm transition-colors cursor-pointer',
                  getStatusColor(slot.status)
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              <div className="text-xs space-y-1">
                <div className="font-medium">{formatTime(slot.start_time)}</div>
                <div>
                  {t('Success Rate')}: {slot.success_rate.toFixed(1)}%
                </div>
                <div>
                  {t('Requests')}: {slot.total_requests}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}
