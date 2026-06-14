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
import { Plus, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  useAvailableModels,
  useAddMonitoredModel,
  useRemoveMonitoredModel,
} from '../hooks/use-monitor-manage'

interface ManageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManageDialog({ open, onOpenChange }: ManageDialogProps) {
  const { t } = useTranslation()
  const [keyword, setKeyword] = useState('')

  const { data: models, isLoading } = useAvailableModels(keyword)
  const addMutation = useAddMonitoredModel()
  const removeMutation = useRemoveMonitoredModel()

  const handleAdd = async (modelName: string) => {
    try {
      await addMutation.mutateAsync(modelName)
      toast.success(
        t('Model {{name}} is now being monitored', {
          name: modelName,
        })
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to add model')
      )
    }
  }

  const handleRemove = async (modelName: string) => {
    try {
      await removeMutation.mutateAsync(modelName)
      toast.success(
        t('Model {{name}} removed from monitoring', {
          name: modelName,
        })
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Failed to remove model')
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('Manage Monitored Models')}</DialogTitle>
          <DialogDescription>
            {t('Add or remove models from monitoring')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('Search models...')}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="h-[400px] overflow-y-auto overflow-x-hidden no-scrollbar">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                {t('Loading...')}
              </div>
            ) : models && models.length > 0 ? (
              <div className="space-y-2 overflow-x-hidden">
                {models.map((model) => (
                  <div
                    key={model.model_name}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent overflow-hidden"
                  >
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div
                        className="font-medium text-sm"
                        title={model.model_name}
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {model.model_name}
                      </div>
                      {model.description && (
                        <div
                          className="text-xs text-muted-foreground"
                          title={model.description}
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {model.description}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {model.is_monitored ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleRemove(model.model_name)}
                          disabled={removeMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleAdd(model.model_name)}
                          disabled={addMutation.isPending}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('No models found')}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
