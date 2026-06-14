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
import { RefreshCw, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ModelMonitorSummary } from '../types'
import { formatDateTime } from '../lib/utils'

interface MonitorHeaderProps {
  summary?: ModelMonitorSummary
  lastRefreshAt?: number
  onRefresh: () => void
  showManage?: boolean
  onManage?: () => void
  isRefreshing?: boolean
}

export function MonitorHeader({
  summary,
  lastRefreshAt,
  onRefresh,
  showManage,
  onManage,
  isRefreshing,
}: MonitorHeaderProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('Model Status Monitor')}</h1>
          <p className="text-muted-foreground">
            {summary && (
              <>
                {t('24h Sliding Window')} • {summary.total_models}{' '}
                {t('models')} •{' '}
                {lastRefreshAt && (
                  <>
                    {t('Updated at')} {formatDateTime(lastRefreshAt)}
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onRefresh}
            variant="outline"
            size="sm"
            disabled={isRefreshing}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
            />
            {t('Refresh')}
          </Button>
          {showManage && (
            <Button onClick={onManage} variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              {t('Manage Models')}
            </Button>
          )}
        </div>
      </div>

      {summary && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {summary.healthy_count}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('Healthy')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {summary.degraded_count}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('Degraded')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {summary.error_count}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('Error')}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-600">
                  {summary.no_data_count}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('No Data')}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
