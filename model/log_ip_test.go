package model

import (
	"maps"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLogIPRecordingPolicy(t *testing.T) {
	oldForce, oldConsume, oldExport := common.ForceRecordIpLogEnabled, common.LogConsumeEnabled, common.DataExportEnabled
	common.OptionMapRWMutex.Lock()
	oldOptions := common.OptionMap
	common.OptionMap = maps.Clone(oldOptions)
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.ForceRecordIpLogEnabled, common.LogConsumeEnabled, common.DataExportEnabled = oldForce, oldConsume, oldExport
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptions
		common.OptionMapRWMutex.Unlock()
	})
	common.LogConsumeEnabled, common.DataExportEnabled = true, false
	user := User{Username: "ip-policy-regression", Setting: `{"record_ip_log":false}`}
	require.NoError(t, DB.Create(&user).Error)
	t.Cleanup(func() {
		require.NoError(t, LOG_DB.Where("user_id = ?", user.Id).Delete(&Log{}).Error)
		require.NoError(t, DB.Unscoped().Delete(&user).Error)
	})
	for _, tc := range []struct {
		name            string
		force, personal bool
		expected        string
	}{
		{"forced despite opt out", true, false, "192.0.2.10"},
		{"disabled and opted out", false, false, ""},
		{"personal opt in", false, true, "192.0.2.10"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			require.NoError(t, updateOptionMap("ForceRecordIpLogEnabled", strconv.FormatBool(tc.force)))
			require.NoError(t, DB.Model(&user).Update("setting", `{"record_ip_log":`+strconv.FormatBool(tc.personal)+`}`).Error)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest("POST", "/v1/chat/completions", nil)
			c.Request.RemoteAddr = "192.0.2.10:1234"
			c.Set("username", user.Username)
			requestID := common.NewRequestId()
			c.Set(common.RequestIdKey, requestID)
			RecordConsumeLog(c, user.Id, RecordConsumeLogParams{ModelName: "test-model"})
			RecordErrorLog(c, user.Id, 0, "test-model", "", "test error", 0, 0, false, "", nil)
			var logs []Log
			require.NoError(t, LOG_DB.Where("request_id = ?", requestID).Order("type").Find(&logs).Error)
			require.Len(t, logs, 2)
			assert.Equal(t, LogTypeConsume, logs[0].Type)
			assert.Equal(t, LogTypeError, logs[1].Type)
			for _, log := range logs {
				assert.Equal(t, tc.expected, log.Ip)
			}
		})
	}
}
