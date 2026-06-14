package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

type ModelMonitor struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	ModelName   string `json:"model_name" gorm:"size:128;not null;uniqueIndex:idx_model_name"`
	Enabled     int    `json:"enabled" gorm:"default:1;index:idx_enabled"`
	Priority    int    `json:"priority" gorm:"default:0"`
	CreatedTime int64  `json:"created_time" gorm:"bigint"`
	UpdatedTime int64  `json:"updated_time" gorm:"bigint"`
	CreatedBy   int    `json:"created_by" gorm:"default:0"`
}

func GetAllEnabledMonitoredModels() ([]ModelMonitor, error) {
	var monitors []ModelMonitor
	err := DB.Where("enabled = ?", 1).Order("priority DESC, id ASC").Find(&monitors).Error
	return monitors, err
}

func GetAllMonitoredModels() ([]ModelMonitor, error) {
	var monitors []ModelMonitor
	err := DB.Order("priority DESC, id ASC").Find(&monitors).Error
	return monitors, err
}

func GetMonitoredModelByName(modelName string) (*ModelMonitor, error) {
	var monitor ModelMonitor
	err := DB.Where("model_name = ?", modelName).First(&monitor).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &monitor, nil
}

func AddMonitoredModel(modelName string, userId int) error {
	// Check if already exists
	existing, err := GetMonitoredModelByName(modelName)
	if err != nil {
		return err
	}
	if existing != nil {
		return errors.New("model already monitored")
	}

	now := time.Now().Unix()
	monitor := ModelMonitor{
		ModelName:   modelName,
		Enabled:     1,
		Priority:    0,
		CreatedTime: now,
		UpdatedTime: now,
		CreatedBy:   userId,
	}
	return DB.Create(&monitor).Error
}

func RemoveMonitoredModel(modelName string) error {
	return DB.Where("model_name = ?", modelName).Delete(&ModelMonitor{}).Error
}

func UpdateMonitoredModelEnabled(modelName string, enabled int) error {
	return DB.Model(&ModelMonitor{}).
		Where("model_name = ?", modelName).
		Updates(map[string]interface{}{
			"enabled":      enabled,
			"updated_time": time.Now().Unix(),
		}).Error
}
