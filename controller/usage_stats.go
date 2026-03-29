package controller

import (
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type DailyCostItem struct {
	Date         string  `json:"date"`
	Quota        int     `json:"quota"`
	Amount       float64 `json:"amount"`
	RequestCount int     `json:"request_count"`
	TokenCount   int     `json:"token_count"`
}

type ModelCostItem struct {
	ModelName    string  `json:"model_name"`
	Quota        int     `json:"quota"`
	Amount       float64 `json:"amount"`
	RequestCount int     `json:"request_count"`
	TokenCount   int     `json:"token_count"`
}

func GetDailyCostStats(c *gin.Context) {
	userId := c.GetInt("id")
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 90 {
		days = 30
	}
	tokenIdStr := c.Query("token_id")
	startTimestamp := time.Now().AddDate(0, 0, -days).Unix()

	var results []struct {
		Date         string `gorm:"column:date"`
		Quota        int    `gorm:"column:quota"`
		RequestCount int    `gorm:"column:request_count"`
		TokenCount   int    `gorm:"column:token_count"`
	}

	tx := model.LOG_DB.Table("logs").
		Where("user_id = ? AND type = ? AND created_at >= ?", userId, model.LogTypeConsume, startTimestamp)

	if tokenIdStr != "" {
		if tokenId, err := strconv.Atoi(tokenIdStr); err == nil && tokenId > 0 {
			tx = tx.Where("token_id = ?", tokenId)
		}
	}

	if common.UsingPostgreSQL {
		tx = tx.Select("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD')").
			Order("date DESC")
	} else if common.UsingSQLite {
		tx = tx.Select("DATE(created_at, 'unixepoch') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(created_at, 'unixepoch')").
			Order("date DESC")
	} else {
		tx = tx.Select("DATE(FROM_UNIXTIME(created_at)) as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(FROM_UNIXTIME(created_at))").
			Order("date DESC")
	}

	if err := tx.Find(&results).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]DailyCostItem, 0, len(results))
	for _, r := range results {
		items = append(items, DailyCostItem{
			Date:         r.Date,
			Quota:        r.Quota,
			Amount:       float64(r.Quota) / common.QuotaPerUnit,
			RequestCount: r.RequestCount,
			TokenCount:   r.TokenCount,
		})
	}
	common.ApiSuccess(c, items)
}

func GetModelCostStats(c *gin.Context) {
	userId := c.GetInt("id")
	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 90 {
		days = 30
	}
	tokenIdStr := c.Query("token_id")
	startTimestamp := time.Now().AddDate(0, 0, -days).Unix()

	var results []struct {
		ModelName    string `gorm:"column:model_name"`
		Quota        int    `gorm:"column:quota"`
		RequestCount int    `gorm:"column:request_count"`
		TokenCount   int    `gorm:"column:token_count"`
	}

	tx := model.LOG_DB.Table("logs").
		Select("model_name, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
		Where("user_id = ? AND type = ? AND created_at >= ?", userId, model.LogTypeConsume, startTimestamp)

	if tokenIdStr != "" {
		if tokenId, err := strconv.Atoi(tokenIdStr); err == nil && tokenId > 0 {
			tx = tx.Where("token_id = ?", tokenId)
		}
	}

	tx = tx.Group("model_name").Order("quota DESC")

	if err := tx.Find(&results).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]ModelCostItem, 0, len(results))
	for _, r := range results {
		items = append(items, ModelCostItem{
			ModelName:    r.ModelName,
			Quota:        r.Quota,
			Amount:       float64(r.Quota) / common.QuotaPerUnit,
			RequestCount: r.RequestCount,
			TokenCount:   r.TokenCount,
		})
	}
	common.ApiSuccess(c, items)
}

func GetTokenUsageStats(c *gin.Context) {
	tokenId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId := c.GetInt("id")

	token, err := model.GetTokenById(tokenId)
	if err != nil {
		common.ApiErrorMsg(c, "令牌不存在")
		return
	}
	if token.UserId != userId {
		common.ApiErrorMsg(c, "无权查看该令牌")
		return
	}

	remainAmount := float64(token.RemainQuota) / common.QuotaPerUnit
	usedAmount := float64(token.UsedQuota) / common.QuotaPerUnit

	common.ApiSuccess(c, gin.H{
		"token_id":       token.Id,
		"token_name":     token.Name,
		"remain_quota":   token.RemainQuota,
		"used_quota":     token.UsedQuota,
		"remain_amount":  remainAmount,
		"used_amount":    usedAmount,
		"unlimited":      token.UnlimitedQuota,
		"expired_time":   token.ExpiredTime,
		"status":         token.Status,
		"created_time":   token.CreatedTime,
		"accessed_time":  token.AccessedTime,
	})
}

func GetTokenDailyCost(c *gin.Context) {
	tokenId, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId := c.GetInt("id")

	token, err := model.GetTokenById(tokenId)
	if err != nil {
		common.ApiErrorMsg(c, "令牌不存在")
		return
	}
	if token.UserId != userId {
		common.ApiErrorMsg(c, "无权查看该令牌")
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
	if days <= 0 || days > 90 {
		days = 30
	}
	startTimestamp := time.Now().AddDate(0, 0, -days).Unix()

	var results []struct {
		Date         string `gorm:"column:date"`
		Quota        int    `gorm:"column:quota"`
		RequestCount int    `gorm:"column:request_count"`
		TokenCount   int    `gorm:"column:token_count"`
	}

	tx := model.LOG_DB.Table("logs").
		Where("token_id = ? AND type = ? AND created_at >= ?", tokenId, model.LogTypeConsume, startTimestamp)

	if common.UsingPostgreSQL {
		tx = tx.Select("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD')").
			Order("date DESC")
	} else if common.UsingSQLite {
		tx = tx.Select("DATE(created_at, 'unixepoch') as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(created_at, 'unixepoch')").
			Order("date DESC")
	} else {
		tx = tx.Select("DATE(FROM_UNIXTIME(created_at)) as date, COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count, COALESCE(SUM(prompt_tokens + completion_tokens),0) as token_count").
			Group("DATE(FROM_UNIXTIME(created_at))").
			Order("date DESC")
	}

	if err := tx.Find(&results).Error; err != nil {
		common.ApiError(c, err)
		return
	}

	items := make([]DailyCostItem, 0, len(results))
	for _, r := range results {
		items = append(items, DailyCostItem{
			Date:         r.Date,
			Quota:        r.Quota,
			Amount:       float64(r.Quota) / common.QuotaPerUnit,
			RequestCount: r.RequestCount,
			TokenCount:   r.TokenCount,
		})
	}
	common.ApiSuccess(c, items)
}

func GetUserUsageOverview(c *gin.Context) {
	userId := c.GetInt("id")

	todayStart := time.Now().Truncate(24 * time.Hour).Unix()
	monthStart := time.Date(time.Now().Year(), time.Now().Month(), 1, 0, 0, 0, 0, time.Now().Location()).Unix()

	var todayStat struct {
		Quota        int `gorm:"column:quota"`
		RequestCount int `gorm:"column:request_count"`
	}
	model.LOG_DB.Table("logs").
		Select("COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count").
		Where("user_id = ? AND type = ? AND created_at >= ?", userId, model.LogTypeConsume, todayStart).
		Scan(&todayStat)

	var monthStat struct {
		Quota        int `gorm:"column:quota"`
		RequestCount int `gorm:"column:request_count"`
	}
	model.LOG_DB.Table("logs").
		Select("COALESCE(SUM(quota),0) as quota, COUNT(*) as request_count").
		Where("user_id = ? AND type = ? AND created_at >= ?", userId, model.LogTypeConsume, monthStart).
		Scan(&monthStat)

	user, err := model.GetUserById(userId, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	common.ApiSuccess(c, gin.H{
		"total_quota":        user.Quota,
		"used_quota":         user.UsedQuota,
		"total_amount":       float64(user.Quota) / common.QuotaPerUnit,
		"used_amount":        float64(user.UsedQuota) / common.QuotaPerUnit,
		"today_quota":        todayStat.Quota,
		"today_amount":       float64(todayStat.Quota) / common.QuotaPerUnit,
		"today_requests":     todayStat.RequestCount,
		"month_quota":        monthStat.Quota,
		"month_amount":       float64(monthStat.Quota) / common.QuotaPerUnit,
		"month_requests":     monthStat.RequestCount,
		"quota_per_unit":     common.QuotaPerUnit,
	})
}
