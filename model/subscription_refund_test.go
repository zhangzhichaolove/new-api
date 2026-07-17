package model

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestRefundSubscriptionPreConsumeUsesSingleTransaction(t *testing.T) {
	oldDB, oldLogDB := DB, LOG_DB
	dbPath := filepath.Join(t.TempDir(), "subscription-refund.db")
	db, err := gorm.Open(sqlite.Open(dbPath+"?_pragma=busy_timeout(100)"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(2)
	DB, LOG_DB = db, db
	t.Cleanup(func() {
		DB, LOG_DB = oldDB, oldLogDB
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, db.AutoMigrate(&UserSubscription{}, &SubscriptionPreConsumeRecord{}))

	subscription := &UserSubscription{
		Id:          1,
		UserId:      1,
		AmountTotal: 1000,
		AmountUsed:  400,
		Status:      "active",
	}
	require.NoError(t, db.Create(subscription).Error)
	record := &SubscriptionPreConsumeRecord{
		RequestId:          "subscription-refund-single-transaction",
		UserId:             subscription.UserId,
		UserSubscriptionId: subscription.Id,
		PreConsumed:        150,
		Status:             "consumed",
	}
	require.NoError(t, db.Create(record).Error)

	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))

	var refundedSubscription UserSubscription
	require.NoError(t, db.First(&refundedSubscription, subscription.Id).Error)
	assert.EqualValues(t, 250, refundedSubscription.AmountUsed)

	var refundedRecord SubscriptionPreConsumeRecord
	require.NoError(t, db.First(&refundedRecord, record.Id).Error)
	assert.Equal(t, "refunded", refundedRecord.Status)

	// Retrying the same request must not refund the subscription twice.
	require.NoError(t, RefundSubscriptionPreConsume(record.RequestId))
	require.NoError(t, db.First(&refundedSubscription, subscription.Id).Error)
	assert.EqualValues(t, 250, refundedSubscription.AmountUsed)

	// A failed SQLite COMMIT used to leave a pooled connection inside a
	// transaction. Verify the pool remains usable for later transactions.
	require.NoError(t, db.Transaction(func(tx *gorm.DB) error {
		return tx.Model(&UserSubscription{}).
			Where("id = ?", subscription.Id).
			Update("amount_used", gorm.Expr("amount_used + ?", 1)).Error
	}))
	require.NoError(t, db.First(&refundedSubscription, subscription.Id).Error)
	assert.EqualValues(t, 251, refundedSubscription.AmountUsed)
}
