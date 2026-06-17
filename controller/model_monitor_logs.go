package controller

import (
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
)

// calculateModelStatsFromLogs 从logs表直接查询精确数据
func calculateModelStatsFromLogs(modelName string, windowHours int) (*ModelMonitorStats, error) {
	// 获取监控配置
	monitorSetting := operation_setting.GetMonitorSetting()
	successOnly := monitorSetting.MonitorSuccessOnly

	// 固定30分钟时间线粒度
	const slotDuration int64 = 1800 // 30分钟
	const numSlots = 48              // 24小时

	// 计算时间窗口
	now := time.Now()
	currentSlotStart := (now.Unix() / slotDuration) * slotDuration
	firstSlotStart := currentSlotStart - int64(numSlots-1)*slotDuration

	// 查询logs表中的数据
	// Type 2 = LogTypeConsume (成功)
	// Type 5 = LogTypeError (失败)
	var logs []struct {
		CreatedAt int64
		Type      int
	}

	query := model.LOG_DB.Model(&model.Log{}).
		Select("created_at, type").
		Where("model_name = ?", modelName).
		Where("created_at >= ? AND created_at <= ?", firstSlotStart, now.Unix())

	if successOnly {
		// 只统计成功的请求
		query = query.Where("type = ?", model.LogTypeConsume)
	} else {
		// 统计成功和失败的请求
		query = query.Where("type IN ?", []int{model.LogTypeConsume, model.LogTypeError})
	}

	err := query.Find(&logs).Error
	if err != nil {
		return nil, err
	}

	// 按时间段聚合
	type slotData struct {
		requestCount int64
		successCount int64
	}
	slotMap := make(map[int64]*slotData)

	var totalRequests int64 = 0
	var totalSuccess int64 = 0

	// 遍历每个日志，精确分配到对应的slot
	for _, log := range logs {
		// 计算该请求所属的slot（向下取整）
		slotStart := (log.CreatedAt / slotDuration) * slotDuration

		// 只处理在窗口内的slot
		if slotStart < firstSlotStart || slotStart > currentSlotStart {
			continue
		}

		// 初始化slot
		if slotMap[slotStart] == nil {
			slotMap[slotStart] = &slotData{}
		}

		// 精确统计
		isSuccess := (log.Type == model.LogTypeConsume)

		if successOnly {
			// 只统计成功的请求
			if isSuccess {
				slotMap[slotStart].requestCount++
				slotMap[slotStart].successCount++
				totalRequests++
				totalSuccess++
			}
		} else {
			// 统计所有请求
			slotMap[slotStart].requestCount++
			totalRequests++
			if isSuccess {
				slotMap[slotStart].successCount++
				totalSuccess++
			}
		}
	}

	// 生成48个时间段的时间线
	timeline := make([]TimeSlotStats, numSlots)

	for i := 0; i < numSlots; i++ {
		slotStart := firstSlotStart + int64(i)*slotDuration
		slotEnd := slotStart + slotDuration

		var successRate float64 = 0
		var totalReq int64 = 0

		if data, exists := slotMap[slotStart]; exists {
			totalReq = data.requestCount
			if totalReq > 0 {
				successRate = float64(data.successCount) / float64(totalReq) * 100
			}
		}

		hasData := totalReq > 0
		timeline[i] = TimeSlotStats{
			StartTime:     slotStart,
			EndTime:       slotEnd,
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
