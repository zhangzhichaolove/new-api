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
import { Activity } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ModelMonitorStats } from '../types'
import { getStatusBadgeVariant } from '../lib/utils'
import { StatusTimeline } from './status-timeline'

interface ModelStatusCardProps {
  data: ModelMonitorStats
}

export function ModelStatusCard({ data }: ModelStatusCardProps) {
  const { t } = useTranslation()
  let statusLabel = 'No Data'
  if (data.status === 'healthy') {
    statusLabel = 'Healthy'
  } else if (data.status === 'degraded') {
    statusLabel = 'Degraded'
  } else if (data.status === 'error') {
    statusLabel = 'Error'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold truncate">{data.model_name}</h3>
          </div>
          <Badge variant={getStatusBadgeVariant(data.status)}>
            {t(statusLabel)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-2xl font-bold">
              {data.success_rate.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {t('Success Rate')}
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold">{data.total_requests}</div>
            <div className="text-xs text-muted-foreground">
              {t('Requests')}
            </div>
          </div>
        </div>

        <StatusTimeline timeline={data.timeline} />
      </CardContent>
    </Card>
  )
}
