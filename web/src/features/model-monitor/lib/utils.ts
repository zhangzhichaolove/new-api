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

import type { MonitorStatus } from '../types'

export function getStatusColor(status: MonitorStatus): string {
  switch (status) {
    case 'healthy':
      return 'bg-green-500 hover:bg-green-600'
    case 'degraded':
      return 'bg-orange-500 hover:bg-orange-600'
    case 'error':
      return 'bg-red-500 hover:bg-red-600'
    case 'no_data':
      return 'bg-gray-200 dark:bg-gray-700'
    default:
      return 'bg-gray-200 dark:bg-gray-700'
  }
}

export function getStatusBadgeVariant(
  status: MonitorStatus
): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'healthy':
      return 'default'
    case 'degraded':
      return 'secondary'
    case 'error':
      return 'destructive'
    case 'no_data':
    default:
      return 'default'
  }
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
