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

import { api } from '@/lib/api'
import type {
  ModelMonitorResponse,
  MonitoredModel,
  AvailableModel,
} from './types'

export async function getMonitorStats() {
  const response = await api.get<{
    success: boolean
    data: ModelMonitorResponse
  }>('/api/monitor/stats')

  if (!response.data.success) {
    throw new Error('Failed to fetch monitor stats')
  }

  return response.data.data
}

export async function getMonitoredModels() {
  const response = await api.get<{
    success: boolean
    data: { items: MonitoredModel[]; total: number }
  }>('/api/monitor/models')

  if (!response.data.success) {
    throw new Error('Failed to fetch monitored models')
  }

  return response.data.data
}

export async function getAvailableModels(keyword?: string) {
  const response = await api.get<{
    success: boolean
    data: AvailableModel[]
  }>('/api/monitor/available-models', {
    params: keyword ? { keyword } : undefined,
  })

  if (!response.data.success) {
    throw new Error('Failed to fetch available models')
  }

  return response.data.data
}

export async function addMonitoredModel(modelName: string) {
  const response = await api.post<{
    success: boolean
    message: string
  }>('/api/monitor/models', {
    model_name: modelName,
  })

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to add model')
  }

  return response.data
}

export async function removeMonitoredModel(modelName: string) {
  const response = await api.delete<{
    success: boolean
    message: string
  }>(`/api/monitor/models/${encodeURIComponent(modelName)}`)

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to remove model')
  }

  return response.data
}

export async function toggleMonitoredModel(modelName: string, enabled: 0 | 1) {
  const response = await api.put<{
    success: boolean
    message: string
  }>(`/api/monitor/models/${encodeURIComponent(modelName)}/toggle`, null, {
    params: { enabled },
  })

  if (!response.data.success) {
    throw new Error(response.data.message || 'Failed to toggle model')
  }

  return response.data
}
