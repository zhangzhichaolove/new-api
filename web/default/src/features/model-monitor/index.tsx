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

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { PublicLayout } from '@/components/layout'
import { MonitorHeader } from './components/monitor-header'
import { StatusLegend } from './components/status-legend'
import { ModelStatusCard } from './components/model-status-card'
import { ManageDialog } from './components/manage-dialog'
import { useMonitorStats } from './hooks/use-monitor-stats'

export function ModelMonitor() {
  const { t } = useTranslation()
  const { data, isLoading, refetch, dataUpdatedAt } = useMonitorStats()
  const user = useAuthStore((state) => state.auth.user)
  const isAdmin = (user?.role ?? 0) >= ROLE.ADMIN

  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  if (isLoading && !data) {
    return (
      <PublicLayout>
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="text-lg text-muted-foreground">
                {t('Loading...')}
              </div>
            </div>
          </div>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className="container mx-auto p-6">
        <MonitorHeader
          summary={data?.summary}
          lastRefreshAt={dataUpdatedAt ? Math.floor(dataUpdatedAt / 1000) : undefined}
          onRefresh={() => refetch()}
          showManage={isAdmin}
          onManage={() => setManageDialogOpen(true)}
          isRefreshing={isLoading}
        />

        <StatusLegend />

        {data?.models && data.models.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.models.map((model) => (
              <ModelStatusCard key={model.model_name} data={model} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {t('No models are being monitored')}
            </p>
            {isAdmin && (
              <p className="text-sm text-muted-foreground mt-2">
                {t('Click [Manage Models] to add models to monitor')}
              </p>
            )}
          </div>
        )}

        {isAdmin && (
          <ManageDialog
            open={manageDialogOpen}
            onOpenChange={setManageDialogOpen}
          />
        )}
      </div>
    </PublicLayout>
  )
}
