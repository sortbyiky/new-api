package controller

import (
	"fmt"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type SubscriptionDetailItem struct {
	Subscription         *model.UserSubscription `json:"subscription"`
	PlanTitle            string                  `json:"plan_title"`
	PlanSubtitle         string                  `json:"plan_subtitle"`
	QuotaPerCycle        int64                   `json:"quota_per_cycle"`
	QuotaPerCycleDisplay float64                 `json:"quota_per_cycle_display"`
	QuotaUsed            int64                   `json:"quota_used"`
	QuotaRemain          int64                   `json:"quota_remain"`
	UsagePercent         float64                 `json:"usage_percent"`
	ResetPeriod          string                  `json:"reset_period"`
	ResetPeriodLabel     string                  `json:"reset_period_label"`
	NextResetTime        int64                   `json:"next_reset_time"`
	NextResetCountdown   int64                   `json:"next_reset_countdown"`
	ManualResetEnabled   bool                    `json:"manual_reset_enabled"`
	ManualResetLimit     int                     `json:"manual_reset_limit"`
	ManualResetRemaining int                     `json:"manual_reset_remaining"`
	ExpireDays           int                     `json:"expire_days"`
	Status               string                  `json:"status"`
	// 周限制相关
	WeeklyQuotaLimit        int64   `json:"weekly_quota_limit"`
	WeeklyQuotaLimitDisplay float64 `json:"weekly_quota_limit_display"`
	WeeklyQuotaUsed         int64   `json:"weekly_quota_used"`
	WeeklyQuotaRemain       int64   `json:"weekly_quota_remain"`
	WeeklyUsagePercent      float64 `json:"weekly_usage_percent"`
	WeeklyQuotaResetTime    int64   `json:"weekly_quota_reset_time"`
	WeeklyQuotaEnabled      bool    `json:"weekly_quota_enabled"`
}

func GetUserSubscriptionDetail(c *gin.Context) {
	userId := c.GetInt("id")

	var subs []model.UserSubscription
	err := model.DB.Where("user_id = ?", userId).
		Order("end_time desc, id desc").
		Find(&subs).Error
	if err != nil {
		common.ApiError(c, err)
		return
	}

	now := common.GetTimestamp()
	today := time.Now().Format("2006-01-02")
	items := make([]SubscriptionDetailItem, 0, len(subs))

	for _, sub := range subs {
		subCopy := sub
		plan, planErr := model.GetSubscriptionPlanById(sub.PlanId)

		item := SubscriptionDetailItem{
			Subscription: &subCopy,
			Status:       sub.Status,
		}

		if planErr == nil && plan != nil {
			item.PlanTitle = plan.Title
			item.PlanSubtitle = plan.Subtitle
			item.QuotaPerCycle = sub.AmountTotal
			item.QuotaPerCycleDisplay = float64(sub.AmountTotal) / common.QuotaPerUnit
			item.QuotaUsed = sub.AmountUsed
			item.ResetPeriod = plan.QuotaResetPeriod
			item.ResetPeriodLabel = resetPeriodLabel(plan.QuotaResetPeriod)
			item.NextResetTime = sub.NextResetTime

			if sub.AmountTotal > 0 {
				item.QuotaRemain = sub.AmountTotal - sub.AmountUsed
				if item.QuotaRemain < 0 {
					item.QuotaRemain = 0
				}
				item.UsagePercent = float64(sub.AmountUsed) / float64(sub.AmountTotal) * 100
				if item.UsagePercent > 100 {
					item.UsagePercent = 100
				}
			} else {
				item.QuotaRemain = -1
				item.UsagePercent = 0
			}

			if sub.NextResetTime > now {
				item.NextResetCountdown = sub.NextResetTime - now
			}

			item.ManualResetLimit = plan.ManualDailyResetLimit
			item.ManualResetEnabled = plan.ManualDailyResetLimit > 0 && sub.AmountTotal > 0

			if item.ManualResetEnabled {
				if sub.ManualResetDate == today {
					item.ManualResetRemaining = plan.ManualDailyResetLimit - sub.ManualResetCount
					if item.ManualResetRemaining < 0 {
						item.ManualResetRemaining = 0
					}
				} else {
					item.ManualResetRemaining = plan.ManualDailyResetLimit
				}
			}

			// 周限制信息
			if plan.WeeklyQuotaLimit > 0 && model.NormalizeResetPeriod(plan.QuotaResetPeriod) == model.SubscriptionResetDaily {
				item.WeeklyQuotaEnabled = true
				item.WeeklyQuotaLimit = plan.WeeklyQuotaLimit
				item.WeeklyQuotaLimitDisplay = float64(plan.WeeklyQuotaLimit) / common.QuotaPerUnit
				weeklyUsed := sub.WeeklyQuotaUsed
				if sub.WeeklyQuotaResetTime > 0 && sub.WeeklyQuotaResetTime <= now {
					weeklyUsed = 0
				}
				item.WeeklyQuotaUsed = weeklyUsed
				item.WeeklyQuotaRemain = plan.WeeklyQuotaLimit - weeklyUsed
				if item.WeeklyQuotaRemain < 0 {
					item.WeeklyQuotaRemain = 0
				}
				if plan.WeeklyQuotaLimit > 0 {
					item.WeeklyUsagePercent = float64(weeklyUsed) / float64(plan.WeeklyQuotaLimit) * 100
					if item.WeeklyUsagePercent > 100 {
						item.WeeklyUsagePercent = 100
					}
				}
				item.WeeklyQuotaResetTime = sub.WeeklyQuotaResetTime
			}
		}

		if sub.EndTime > now {
			item.ExpireDays = int((sub.EndTime - now) / 86400)
		} else {
			item.ExpireDays = 0
		}

		if sub.Status == "active" && sub.EndTime <= now {
			item.Status = "expired"
		}

		items = append(items, item)
	}

	common.ApiSuccess(c, items)
}

func resetPeriodLabel(period string) string {
	switch period {
	case model.SubscriptionResetDaily:
		return "每天"
	case model.SubscriptionResetWeekly:
		return "每周"
	case model.SubscriptionResetMonthly:
		return "每月"
	case model.SubscriptionResetCustom:
		return "自定义"
	default:
		return "不重置"
	}
}

type ManualResetRequest struct {
	SubscriptionId int `json:"subscription_id"`
}

func ManualResetSubscription(c *gin.Context) {
	userId := c.GetInt("id")
	var req ManualResetRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.SubscriptionId <= 0 {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	today := time.Now().Format("2006-01-02")
	var resultRemaining int
	var resultAmountUsed int64

	err := model.DB.Transaction(func(tx *gorm.DB) error {
		var sub model.UserSubscription
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND user_id = ?", req.SubscriptionId, userId).
			First(&sub).Error; err != nil {
			return fmt.Errorf("订阅不存在")
		}

		if sub.Status != "active" {
			return fmt.Errorf("订阅状态非活跃，无法重置")
		}
		now := common.GetTimestamp()
		if sub.EndTime <= now {
			return fmt.Errorf("订阅已过期")
		}

		plan, err := model.GetSubscriptionPlanById(sub.PlanId)
		if err != nil || plan == nil {
			return fmt.Errorf("订阅计划不存在")
		}
		if plan.ManualDailyResetLimit <= 0 {
			return fmt.Errorf("该订阅计划不允许手动重置")
		}
		if sub.AmountTotal <= 0 {
			return fmt.Errorf("无限额度无需重置")
		}

		resetCount := sub.ManualResetCount
		if sub.ManualResetDate != today {
			resetCount = 0
		}
		if resetCount >= plan.ManualDailyResetLimit {
			return fmt.Errorf("今日手动重置次数已达上限 (%d/%d)", resetCount, plan.ManualDailyResetLimit)
		}

		if err := tx.Model(&model.UserSubscription{}).Where("id = ?", sub.Id).Updates(map[string]interface{}{
			"amount_used":        0,
			"manual_reset_count": resetCount + 1,
			"manual_reset_date":  today,
			"updated_at":         now,
		}).Error; err != nil {
			return err
		}

		resultRemaining = plan.ManualDailyResetLimit - resetCount - 1
		resultAmountUsed = 0

		model.RecordLog(userId, model.LogTypeTopup,
			fmt.Sprintf("手动重置订阅额度（订阅ID: %d，计划: %s），重置前已用: $%.4f",
				sub.Id, plan.Title, float64(sub.AmountUsed)/common.QuotaPerUnit))

		return nil
	})

	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	common.ApiSuccess(c, gin.H{
		"amount_used":             resultAmountUsed,
		"manual_reset_remaining":  resultRemaining,
	})
}

func GetSubscriptionUsageHistory(c *gin.Context) {
	userId := c.GetInt("id")
	subIdStr := c.Query("subscription_id")
	subId, _ := strconv.Atoi(subIdStr)
	if subId <= 0 {
		common.ApiErrorMsg(c, "subscription_id 参数无效")
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 90 {
		days = 30
	}

	var sub model.UserSubscription
	if err := model.DB.Where("id = ? AND user_id = ?", subId, userId).First(&sub).Error; err != nil {
		common.ApiErrorMsg(c, "订阅不存在")
		return
	}

	startTimestamp := time.Now().AddDate(0, 0, -days).Unix()
	if sub.StartTime > startTimestamp {
		startTimestamp = sub.StartTime
	}

	endTimestamp := sub.EndTime
	nowTs := time.Now().Unix()
	if endTimestamp > nowTs {
		endTimestamp = nowTs
	}

	var dailyResults []struct {
		Date         string `gorm:"column:date"`
		Quota        int    `gorm:"column:quota"`
		RequestCount int    `gorm:"column:request_count"`
		TokenCount   int    `gorm:"column:token_count"`
	}

	tx := model.LOG_DB.Table("logs").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?",
			userId, model.LogTypeConsume, startTimestamp, endTimestamp)

	if common.UsingPostgreSQL {
		tx = tx.Select("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD')").
			Order("date ASC")
	} else if common.UsingSQLite {
		tx = tx.Select("DATE(created_at, 'unixepoch') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(created_at, 'unixepoch')").
			Order("date ASC")
	} else {
		tx = tx.Select("DATE(FROM_UNIXTIME(created_at)) as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(FROM_UNIXTIME(created_at))").
			Order("date ASC")
	}

	if err := tx.Find(&dailyResults).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	dailyItems := make([]DailyCostItem, 0, len(dailyResults))
	for _, r := range dailyResults {
		dailyItems = append(dailyItems, DailyCostItem{
			Date:         r.Date,
			Quota:        r.Quota,
			Amount:       float64(r.Quota) / common.QuotaPerUnit,
			RequestCount: r.RequestCount,
			TokenCount:   r.TokenCount,
		})
	}

	var modelResults []struct {
		ModelName    string `gorm:"column:model_name"`
		Quota        int    `gorm:"column:quota"`
		RequestCount int    `gorm:"column:request_count"`
		TokenCount   int    `gorm:"column:token_count"`
	}

	modelTx := model.LOG_DB.Table("logs").
		Select("model_name, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?",
			userId, model.LogTypeConsume, startTimestamp, endTimestamp).
		Group("model_name").Order("quota DESC")

	if err := modelTx.Find(&modelResults).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	modelItems := make([]ModelCostItem, 0, len(modelResults))
	for _, r := range modelResults {
		modelItems = append(modelItems, ModelCostItem{
			ModelName:    r.ModelName,
			Quota:        r.Quota,
			Amount:       float64(r.Quota) / common.QuotaPerUnit,
			RequestCount: r.RequestCount,
			TokenCount:   r.TokenCount,
		})
	}

	common.ApiSuccess(c, gin.H{
		"daily":  dailyItems,
		"models": modelItems,
	})
}
