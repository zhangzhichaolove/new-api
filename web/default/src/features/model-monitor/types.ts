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

export type MonitorStatus = 'healthy' | 'degraded' | 'error' | 'no_data'

export interface TimeSlotStats {
  start_time: number
  end_time: number
  success_rate: number
  total_requests: number
  status: MonitorStatus
}

export interface ModelMonitorStats {
  model_name: string
  status: MonitorStatus
  success_rate: number
  total_requests: number
  success_count: number
  error_count: number
  timeline: TimeSlotStats[]
}

export interface ModelMonitorSummary {
  window_hours: number
  total_models: number
  last_refresh_at: number
  healthy_count: number
  degraded_count: number
  error_count: number
  no_data_count: number
}

export interface ModelMonitorResponse {
  summary: ModelMonitorSummary
  models: ModelMonitorStats[]
}

export interface MonitoredModel {
  id: number
  model_name: string
  enabled: number
  priority: number
  created_time: number
  updated_time: number
  created_by: number
}

export interface AvailableModel {
  model_name: string
  description: string
  is_monitored: boolean
}
