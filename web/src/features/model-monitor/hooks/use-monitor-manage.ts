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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getMonitoredModels,
  getAvailableModels,
  addMonitoredModel,
  removeMonitoredModel,
} from '../api'

export function useMonitoredModels() {
  return useQuery({
    queryKey: ['model-monitor', 'models'],
    queryFn: getMonitoredModels,
  })
}

export function useAvailableModels(keyword?: string) {
  return useQuery({
    queryKey: ['model-monitor', 'available-models', keyword],
    queryFn: () => getAvailableModels(keyword),
  })
}

export function useAddMonitoredModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: addMonitoredModel,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'models'],
      })
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'available-models'],
      })
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'stats'],
      })
    },
  })
}

export function useRemoveMonitoredModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeMonitoredModel,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'models'],
      })
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'available-models'],
      })
      queryClient.invalidateQueries({
        queryKey: ['model-monitor', 'stats'],
      })
    },
  })
}
