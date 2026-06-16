package controller

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/model"
	perfmetrics "github.com/QuantumNous/new-api/pkg/perf_metrics"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/perf_metrics_setting"
	"github.com/gin-gonic/gin"
)

// TimeSlotStats 单个时间段统计
type TimeSlotStats struct {
	StartTime     int64   `json:"start_time"`
	EndTime       int64   `json:"end_time"`
	SuccessRate   float64 `json:"success_rate"`
	TotalRequests int     `json:"total_requests"`
	Status        string  `json:"status"`
}

// ModelMonitorStats 单个模型的监控统计
type ModelMonitorStats struct {
	ModelName     string          `json:"model_name"`
	Status        string          `json:"status"`
	SuccessRate   float64         `json:"success_rate"`
	TotalRequests int             `json:"total_requests"`
	SuccessCount  int             `json:"success_count"`
	ErrorCount    int             `json:"error_count"`
	Timeline      []TimeSlotStats `json:"timeline"`
}

// ModelMonitorSummary 监控摘要
type ModelMonitorSummary struct {
	WindowHours   int   `json:"window_hours"`
	TotalModels   int   `json:"total_models"`
	LastRefreshAt int64 `json:"last_refresh_at"`
	HealthyCount  int   `json:"healthy_count"`
	DegradedCount int   `json:"degraded_count"`
	ErrorCount    int   `json:"error_count"`
	NoDataCount   int   `json:"no_data_count"`
}

// ModelMonitorResponse 监控统计响应
type ModelMonitorResponse struct {
	Summary ModelMonitorSummary `json:"summary"`
	Models  []ModelMonitorStats `json:"models"`
}

// AvailableModel 可选模型
type AvailableModel struct {
	ModelName   string `json:"model_name"`
	Description string `json:"description"`
	IsMonitored bool   `json:"is_monitored"`
}

func calculateStatus(successRate float64, hasData bool) string {
	if !hasData {
		return "no_data"
	}
	if successRate >= 90 {
		return "healthy"
	} else if successRate >= 50 {
		return "degraded"
	}
	return "error"
}

func calculateModelStats(modelName string, windowHours int) (*ModelMonitorStats, error) {
	// 使用 perf_metrics 系统查询数据（更准确的成功率统计）
	// 不再使用 logs 表的 LogTypeConsume/LogTypeError，因为那些代表"扣费"而非"请求成功"

	// 查询原始 bucket 数据（自动合并数据库和内存中的热数据）
	buckets, err := perfmetrics.QueryModelRawBuckets(modelName, windowHours)
	if err != nil {
		return nil, err
	}

	// 获取监控配置
	monitorSetting := operation_setting.GetMonitorSetting()
	successOnly := monitorSetting.MonitorSuccessOnly

	now := time.Now()
	slotDuration := int64(windowHours * 3600 / 48) // 每个时段的秒数
	// 向下取整到当前 slot 的起始时间，确保当前时刻落在最后一个时间段内
	nowSlot := (now.Unix() / slotDuration) * slotDuration

	// 按时间段聚合（将 perf_metrics 的细粒度 bucket 聚合到48个时间段）
	type slotData struct {
		requestCount int64
		successCount int64
	}
	slotMap := make(map[int64]*slotData)

	var totalRequests int64 = 0
	var totalSuccess int64 = 0

	for bucketTs, counters := range buckets {
		// 将 perfmetrics 的 bucket_ts 映射到48个30分钟时间段
		// 获取 bucket 的粒度配置
		bucketSeconds := perf_metrics_setting.GetBucketSeconds()

		// 计算 bucket 覆盖的 slot 范围
		bucketStartSlot := (bucketTs / slotDuration) * slotDuration
		bucketEndSlot := ((bucketTs + bucketSeconds - 1) / slotDuration) * slotDuration

		// 计算被覆盖的 slot 数量
		numSlots := (bucketEndSlot - bucketStartSlot) / slotDuration + 1
		if numSlots < 1 {
			numSlots = 1
		}

		// 将 bucket 的数据平均分配到覆盖的所有 slot
		for slotKey := bucketStartSlot; slotKey <= bucketEndSlot; slotKey += slotDuration {
			if slotMap[slotKey] == nil {
				slotMap[slotKey] = &slotData{}
			}

			// 平均分配到每个 slot
			avgRequests := counters.RequestCount / numSlots
			avgSuccess := counters.SuccessCount / numSlots

			// 如果开启"仅统计成功状态"，则只统计成功的请求
			if successOnly {
				slotMap[slotKey].requestCount += avgSuccess
				slotMap[slotKey].successCount += avgSuccess
			} else {
				slotMap[slotKey].requestCount += avgRequests
				slotMap[slotKey].successCount += avgSuccess
			}
		}

		// 累计总数（只累计一次，不要重复）
		if successOnly {
			totalRequests += counters.SuccessCount
			totalSuccess += counters.SuccessCount
		} else {
			totalRequests += counters.RequestCount
			totalSuccess += counters.SuccessCount
		}
	}

	// 生成48个时间段的时间线
	timeline := make([]TimeSlotStats, 48)

	for i := 0; i < 48; i++ {
		slotKey := nowSlot - int64(47-i)*slotDuration
		slotStart := time.Unix(slotKey, 0)
		slotEnd := slotStart.Add(time.Duration(slotDuration) * time.Second)

		var successRate float64 = 0
		var totalReq int64 = 0

		if data, exists := slotMap[slotKey]; exists {
			totalReq = data.requestCount
			if totalReq > 0 {
				successRate = float64(data.successCount) / float64(totalReq) * 100
			}
		}

		hasData := totalReq > 0
		timeline[i] = TimeSlotStats{
			StartTime:     slotStart.Unix(),
			EndTime:       slotEnd.Unix(),
			SuccessRate:   successRate,
			TotalRequests: int(totalReq),
			Status:        calculateStatus(successRate, hasData),
		}
	}

	// 计算整体统计
	var overallSuccessRate float64 = 0
	hasData := totalRequests > 0

	if hasData {
		overallSuccessRate = float64(totalSuccess) / float64(totalRequests) * 100
	}

	return &ModelMonitorStats{
		ModelName:     modelName,
		Status:        calculateStatus(overallSuccessRate, hasData),
		SuccessRate:   overallSuccessRate,
		TotalRequests: int(totalRequests),
		SuccessCount:  int(totalSuccess),
		ErrorCount:    int(totalRequests - totalSuccess),
		Timeline:      timeline,
	}, nil
}

// GetModelMonitorStats 获取监控统计数据
func GetModelMonitorStats(c *gin.Context) {
	windowHours := 24

	// 获取所有启用的监控模型
	monitors, err := model.GetAllEnabledMonitoredModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// 计算每个模型的统计数据
	modelsStats := make([]ModelMonitorStats, 0, len(monitors))
	summary := ModelMonitorSummary{
		WindowHours:   windowHours,
		TotalModels:   len(monitors),
		LastRefreshAt: time.Now().Unix(),
	}

	for _, monitor := range monitors {
		stats, err := calculateModelStats(monitor.ModelName, windowHours)
		if err != nil {
			continue
		}

		modelsStats = append(modelsStats, *stats)

		// 更新摘要统计
		switch stats.Status {
		case "healthy":
			summary.HealthyCount++
		case "degraded":
			summary.DegradedCount++
		case "error":
			summary.ErrorCount++
		case "no_data":
			summary.NoDataCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": ModelMonitorResponse{
			Summary: summary,
			Models:  modelsStats,
		},
	})
}

// GetMonitoredModels 获取已监控模型列表（管理员）
func GetMonitoredModels(c *gin.Context) {
	monitors, err := model.GetAllMonitoredModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"items": monitors,
			"total": len(monitors),
		},
	})
}

// GetAvailableModels 获取可选模型列表（管理员）
// 数据来源：
// 1. 从 abilities 表查询 enabled = true 且 models.status = 1 的模型（与 /api/pricing 一致）
// 2. 始终包含已监控的模型（即使它们已被删除或禁用），以便管理员可以移除过期的监控项
func GetAvailableModels(c *gin.Context) {
	keyword := c.Query("keyword")

	// 获取已监控的模型
	monitors, err := model.GetAllMonitoredModels()
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	monitoredMap := make(map[string]bool)
	modelNamesSet := make(map[string]bool)

	// 先添加所有已监控的模型（无论它们是否还存在）
	for _, monitor := range monitors {
		monitoredMap[monitor.ModelName] = true
		// 如果有关键词筛选，检查是否匹配
		if keyword == "" || strings.Contains(strings.ToLower(monitor.ModelName), strings.ToLower(keyword)) {
			modelNamesSet[monitor.ModelName] = true
		}
	}

	// 查询当前可用的模型（与 /api/pricing 接口保持一致）
	var availableModelNames []string
	query := model.DB.Table("abilities").
		Select("DISTINCT abilities.model").
		Joins("LEFT JOIN models ON abilities.model = models.model_name").
		Where("abilities.enabled = ?", true).
		Where("abilities.model != ''").
		Where("(models.model_name IS NULL OR models.status = ?)", 1)

	if keyword != "" {
		query = query.Where("abilities.model LIKE ?", "%"+keyword+"%")
	}

	query = query.Order("abilities.model ASC")

	err = query.Pluck("abilities.model", &availableModelNames).Error
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	// 合并可用模型到集合中
	for _, name := range availableModelNames {
		modelNamesSet[name] = true
	}

	// 转换为切片并排序
	modelNames := make([]string, 0, len(modelNamesSet))
	for name := range modelNamesSet {
		modelNames = append(modelNames, name)
	}
	sort.Strings(modelNames)

	// 构建返回结果
	availableModels := make([]AvailableModel, 0, len(modelNames))
	for _, name := range modelNames {
		availableModels = append(availableModels, AvailableModel{
			ModelName:   name,
			Description: "",
			IsMonitored: monitoredMap[name],
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    availableModels,
	})
}

// AddMonitoredModel 添加监控模型（管理员）
func AddMonitoredModel(c *gin.Context) {
	var req struct {
		ModelName string `json:"model_name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid request: " + err.Error(),
		})
		return
	}

	// Validate model name
	req.ModelName = strings.TrimSpace(req.ModelName)
	if req.ModelName == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model name cannot be empty",
		})
		return
	}

	userId := c.GetInt("id")
	err := model.AddMonitoredModel(req.ModelName, userId)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "model added to monitoring",
	})
}

// RemoveMonitoredModel 移除监控模型（管理员）
func RemoveMonitoredModel(c *gin.Context) {
	modelName := c.Param("model_name")
	if modelName == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "model name is required",
		})
		return
	}

	err := model.RemoveMonitoredModel(modelName)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "model removed from monitoring",
	})
}

// ToggleMonitoredModel 启用/禁用监控模型（管理员）
func ToggleMonitoredModel(c *gin.Context) {
	modelName := c.Param("model_name")
	enabledStr := c.Query("enabled")

	enabled, err := strconv.Atoi(enabledStr)
	if err != nil || (enabled != 0 && enabled != 1) {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "invalid enabled value",
		})
		return
	}

	err = model.UpdateMonitoredModelEnabled(modelName, enabled)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "model status updated",
	})
}
