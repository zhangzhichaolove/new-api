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
import { Card, CardContent } from '@/components/ui/card'

export function StatusLegend() {
  const { t } = useTranslation()

  const items = [
    { color: 'bg-green-500', label: t('Healthy (>90%)') },
    { color: 'bg-orange-500', label: t('Degraded (50-90%)') },
    { color: 'bg-red-500', label: t('Error (<50%)') },
    { color: 'bg-gray-400', label: t('No Data') },
  ]

  return (
    <Card className="mb-6">
      <CardContent>
        <div className="flex flex-wrap items-center gap-6">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded ${item.color}`} />
              <span className="text-sm text-muted-foreground">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
