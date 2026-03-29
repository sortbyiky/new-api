package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func CreateQuotaCard(c *gin.Context) {
	card := model.QuotaCard{}
	if err := c.ShouldBindJSON(&card); err != nil {
		common.ApiError(c, err)
		return
	}
	if card.Name == "" {
		common.ApiErrorMsg(c, "额度卡名称不能为空")
		return
	}
	if card.CardType == "" {
		card.CardType = model.QuotaCardTypeQuota
	}
	if card.CardType != model.QuotaCardTypeQuota && card.CardType != model.QuotaCardTypeTime && card.CardType != model.QuotaCardTypeCombo {
		common.ApiErrorMsg(c, "无效的卡类型，支持: quota, time, combo")
		return
	}
	if (card.CardType == model.QuotaCardTypeQuota || card.CardType == model.QuotaCardTypeCombo) && card.QuotaAmount <= 0 {
		common.ApiErrorMsg(c, "额度卡的额度必须大于0")
		return
	}
	if (card.CardType == model.QuotaCardTypeTime || card.CardType == model.QuotaCardTypeCombo) && card.TimeAmount <= 0 {
		common.ApiErrorMsg(c, "时间卡的时间数量必须大于0")
		return
	}
	count := card.Count
	if count <= 0 {
		count = 1
	}
	if count > 100 {
		common.ApiErrorMsg(c, "单次最多创建100张额度卡")
		return
	}
	createdBy := c.GetInt("id")
	var codes []string
	for i := 0; i < count; i++ {
		newCard := model.QuotaCard{
			Name:        card.Name,
			CardType:    card.CardType,
			QuotaAmount: card.QuotaAmount,
			TimeAmount:  card.TimeAmount,
			TimeUnit:    card.TimeUnit,
			CreatedBy:   createdBy,
			ExpiredTime: card.ExpiredTime,
		}
		if newCard.TimeUnit == "" {
			newCard.TimeUnit = "days"
		}
		if err := model.CreateQuotaCard(&newCard); err != nil {
			common.SysError("创建额度卡失败: " + err.Error())
			c.JSON(http.StatusOK, gin.H{
				"success": false,
				"message": "创建额度卡失败",
				"data":    codes,
			})
			return
		}
		codes = append(codes, newCard.Code)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    codes,
	})
}

func GetQuotaCards(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	status, _ := strconv.Atoi(c.Query("status"))
	keyword := c.Query("keyword")

	var cards []*model.QuotaCard
	var total int64
	var err error
	if keyword != "" {
		cards, total, err = model.SearchQuotaCards(keyword, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	} else {
		cards, total, err = model.GetAllQuotaCards(status, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(cards)
	common.ApiSuccess(c, pageInfo)
}

func GetQuotaCardStats(c *gin.Context) {
	stats, err := model.GetQuotaCardStats()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, stats)
}

func DeleteQuotaCard(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DeleteQuotaCardById(id); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

type RedeemQuotaCardRequest struct {
	Code    string `json:"code"`
	TokenId int    `json:"token_id"`
}

func RedeemQuotaCard(c *gin.Context) {
	req := RedeemQuotaCardRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.Code == "" {
		common.ApiErrorMsg(c, "卡密不能为空")
		return
	}
	if req.TokenId <= 0 {
		common.ApiErrorMsg(c, "请选择要充值的令牌")
		return
	}
	userId := c.GetInt("id")

	token, err := model.GetTokenById(req.TokenId)
	if err != nil {
		common.ApiErrorMsg(c, "令牌不存在")
		return
	}
	if token.UserId != userId {
		common.ApiErrorMsg(c, "只能给自己的令牌充值")
		return
	}

	card, err := model.GetQuotaCardByCode(req.Code)
	if err != nil {
		common.ApiErrorMsg(c, "无效的卡密")
		return
	}
	if card.Status != model.QuotaCardStatusUnused {
		common.ApiErrorMsg(c, "该卡密已被使用或已撤销")
		return
	}
	if card.ExpiredTime != 0 && card.ExpiredTime < common.GetTimestamp() {
		common.ApiErrorMsg(c, "该卡密已过期")
		return
	}

	beforeQuota := token.RemainQuota
	beforeExpiry := token.ExpiredTime
	afterQuota := beforeQuota
	afterExpiry := beforeExpiry
	quotaAdded := 0
	timeAdded := 0

	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if card.CardType == model.QuotaCardTypeQuota || card.CardType == model.QuotaCardTypeCombo {
			afterQuota = beforeQuota + card.QuotaAmount
			quotaAdded = card.QuotaAmount
			if err := tx.Model(&model.Token{}).Where("id = ?", req.TokenId).
				Update("remain_quota", gorm.Expr("remain_quota + ?", card.QuotaAmount)).Error; err != nil {
				return err
			}
		}
		if card.CardType == model.QuotaCardTypeTime || card.CardType == model.QuotaCardTypeCombo {
			timeAdded = card.TimeAmount
			var addSeconds int64
			switch card.TimeUnit {
			case "hours":
				addSeconds = int64(card.TimeAmount) * 3600
			default:
				addSeconds = int64(card.TimeAmount) * 86400
			}
			if beforeExpiry <= 0 {
				afterExpiry = common.GetTimestamp() + addSeconds
			} else {
				afterExpiry = beforeExpiry + addSeconds
			}
			if err := tx.Model(&model.Token{}).Where("id = ?", req.TokenId).
				Update("expired_time", afterExpiry).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&model.QuotaCard{}).Where("id = ?", card.Id).Updates(map[string]interface{}{
			"status":          model.QuotaCardStatusRedeemed,
			"redeemed_by":     userId,
			"redeemed_time":   common.GetTimestamp(),
			"target_token_id": req.TokenId,
		}).Error; err != nil {
			return err
		}
		username := c.GetString("username")
		record := &model.RedemptionRecord{
			CardId:       card.Id,
			CardCode:     card.Code,
			UserId:       userId,
			Username:     username,
			TokenId:      req.TokenId,
			TokenName:    token.Name,
			CardType:     card.CardType,
			QuotaAdded:   quotaAdded,
			TimeAdded:    timeAdded,
			BeforeQuota:  beforeQuota,
			AfterQuota:   afterQuota,
			BeforeExpiry: beforeExpiry,
			AfterExpiry:  afterExpiry,
		}
		return tx.Create(record).Error
	})

	if err != nil {
		common.SysError("额度卡兑换失败: " + err.Error())
		common.ApiErrorMsg(c, "兑换失败，请稍后重试")
		return
	}

	model.RecordLog(userId, model.LogTypeTopup,
		fmt.Sprintf("通过额度卡充值，卡密 %s，令牌 %s，额度 %s",
			card.Code, token.Name, logger.LogQuota(quotaAdded)))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota_added":  quotaAdded,
			"time_added":   timeAdded,
			"before_quota": beforeQuota,
			"after_quota":  afterQuota,
		},
	})
}

func RevokeQuotaCardRedemption(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	type RevokeRequest struct {
		Reason string `json:"reason"`
	}
	req := RevokeRequest{}
	_ = c.ShouldBindJSON(&req)

	record, err := model.GetRedemptionRecordById(id)
	if err != nil {
		common.ApiErrorMsg(c, "兑换记录不存在")
		return
	}
	if record.Revoked {
		common.ApiErrorMsg(c, "该兑换已被撤销")
		return
	}

	revokedBy := c.GetInt("id")

	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if record.QuotaAdded > 0 {
			var token model.Token
			if err := tx.First(&token, "id = ?", record.TokenId).Error; err != nil {
				return err
			}
			deductAmount := record.QuotaAdded
			minQuota := token.UsedQuota
			if token.RemainQuota-deductAmount < minQuota {
				deductAmount = token.RemainQuota - minQuota
			}
			if deductAmount > 0 {
				if err := tx.Model(&model.Token{}).Where("id = ?", record.TokenId).
					Update("remain_quota", gorm.Expr("remain_quota - ?", deductAmount)).Error; err != nil {
					return err
				}
			}
		}
		if record.TimeAdded > 0 && record.AfterExpiry > record.BeforeExpiry {
			timeDelta := record.AfterExpiry - record.BeforeExpiry
			if err := tx.Model(&model.Token{}).Where("id = ?", record.TokenId).
				Update("expired_time", gorm.Expr("expired_time - ?", timeDelta)).Error; err != nil {
				return err
			}
		}
		if err := tx.Model(&model.QuotaCard{}).Where("id = ?", record.CardId).
			Update("status", model.QuotaCardStatusRevoked).Error; err != nil {
			return err
		}
		return tx.Model(&model.RedemptionRecord{}).Where("id = ?", record.Id).Updates(map[string]interface{}{
			"revoked":       true,
			"revoked_time":  common.GetTimestamp(),
			"revoked_by":    revokedBy,
			"revoke_reason": req.Reason,
		}).Error
	})

	if err != nil {
		common.SysError("撤销兑换失败: " + err.Error())
		common.ApiErrorMsg(c, "撤销失败")
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
	})
}

func GetRedemptionRecords(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	records, total, err := model.GetAllRedemptionRecords(pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

func GetUserRedemptionRecords(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	records, total, err := model.GetRedemptionRecordsByUserId(userId, pageInfo.GetStartIdx(), pageInfo.GetPageSize())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(records)
	common.ApiSuccess(c, pageInfo)
}

// AdminGetUserTokens 管理员获取指定用户的 Token 列表，用于分配订阅时选择目标 Token
func AdminGetUserTokens(c *gin.Context) {
	userId, err := strconv.Atoi(c.Param("userId"))
	if err != nil || userId <= 0 {
		common.ApiErrorMsg(c, "用户ID无效")
		return
	}
	user, err := model.GetUserById(userId, false)
	if err != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}
	tokens, err := model.GetAllUserTokens(userId, 0, 100)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	type TokenBrief struct {
		Id          int    `json:"id"`
		Name        string `json:"name"`
		Status      int    `json:"status"`
		RemainQuota int    `json:"remain_quota"`
		UsedQuota   int    `json:"used_quota"`
		ExpiredTime int64  `json:"expired_time"`
	}
	var result []TokenBrief
	for _, t := range tokens {
		result = append(result, TokenBrief{
			Id:          t.Id,
			Name:        t.Name,
			Status:      t.Status,
			RemainQuota: t.RemainQuota,
			UsedQuota:   t.UsedQuota,
			ExpiredTime: t.ExpiredTime,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"username": user.Username,
			"tokens":   result,
		},
	})
}

type AdminAssignRequest struct {
	UserId      int    `json:"user_id"`
	TokenId     int    `json:"token_id"`
	CardType    string `json:"card_type"`
	QuotaAmount int    `json:"quota_amount"`
	TimeAmount  int    `json:"time_amount"`
	TimeUnit    string `json:"time_unit"`
	Name        string `json:"name"`
}

// AdminAssignSubscription 管理员直接给用户的 Token 分配额度/时间，自动创建卡并完成兑换
func AdminAssignSubscription(c *gin.Context) {
	req := AdminAssignRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	if req.UserId <= 0 {
		common.ApiErrorMsg(c, "用户ID无效")
		return
	}
	if req.TokenId <= 0 {
		common.ApiErrorMsg(c, "令牌ID无效")
		return
	}
	if req.CardType == "" {
		req.CardType = model.QuotaCardTypeQuota
	}
	if req.CardType != model.QuotaCardTypeQuota && req.CardType != model.QuotaCardTypeTime && req.CardType != model.QuotaCardTypeCombo {
		common.ApiErrorMsg(c, "无效的卡类型")
		return
	}
	if (req.CardType == model.QuotaCardTypeQuota || req.CardType == model.QuotaCardTypeCombo) && req.QuotaAmount <= 0 {
		common.ApiErrorMsg(c, "额度必须大于0")
		return
	}
	if (req.CardType == model.QuotaCardTypeTime || req.CardType == model.QuotaCardTypeCombo) && req.TimeAmount <= 0 {
		common.ApiErrorMsg(c, "时间数量必须大于0")
		return
	}
	if req.TimeUnit == "" {
		req.TimeUnit = "days"
	}
	if req.Name == "" {
		req.Name = "管理员分配"
	}

	token, err := model.GetTokenById(req.TokenId)
	if err != nil {
		common.ApiErrorMsg(c, "令牌不存在")
		return
	}
	if token.UserId != req.UserId {
		common.ApiErrorMsg(c, "令牌不属于该用户")
		return
	}

	user, err := model.GetUserById(req.UserId, false)
	if err != nil || user == nil {
		common.ApiErrorMsg(c, "用户不存在")
		return
	}

	adminId := c.GetInt("id")
	beforeQuota := token.RemainQuota
	beforeExpiry := token.ExpiredTime
	afterQuota := beforeQuota
	afterExpiry := beforeExpiry
	quotaAdded := 0
	timeAdded := 0

	err = model.DB.Transaction(func(tx *gorm.DB) error {
		card := &model.QuotaCard{
			Name:        req.Name,
			CardType:    req.CardType,
			QuotaAmount: req.QuotaAmount,
			TimeAmount:  req.TimeAmount,
			TimeUnit:    req.TimeUnit,
			CreatedBy:   adminId,
			Code:        model.GenerateCardCode(),
			CreatedTime: common.GetTimestamp(),
			Status:      model.QuotaCardStatusRedeemed,
			RedeemedBy:  req.UserId,
			RedeemedTime: common.GetTimestamp(),
			TargetTokenId: req.TokenId,
		}
		if err := tx.Create(card).Error; err != nil {
			return err
		}

		if req.CardType == model.QuotaCardTypeQuota || req.CardType == model.QuotaCardTypeCombo {
			afterQuota = beforeQuota + req.QuotaAmount
			quotaAdded = req.QuotaAmount
			if err := tx.Model(&model.Token{}).Where("id = ?", req.TokenId).
				Update("remain_quota", gorm.Expr("remain_quota + ?", req.QuotaAmount)).Error; err != nil {
				return err
			}
		}
		if req.CardType == model.QuotaCardTypeTime || req.CardType == model.QuotaCardTypeCombo {
			timeAdded = req.TimeAmount
			var addSeconds int64
			switch req.TimeUnit {
			case "hours":
				addSeconds = int64(req.TimeAmount) * 3600
			default:
				addSeconds = int64(req.TimeAmount) * 86400
			}
			if beforeExpiry <= 0 {
				afterExpiry = common.GetTimestamp() + addSeconds
			} else {
				afterExpiry = beforeExpiry + addSeconds
			}
			if err := tx.Model(&model.Token{}).Where("id = ?", req.TokenId).
				Update("expired_time", afterExpiry).Error; err != nil {
				return err
			}
		}

		record := &model.RedemptionRecord{
			CardId:       card.Id,
			CardCode:     card.Code,
			UserId:       req.UserId,
			Username:     user.Username,
			TokenId:      req.TokenId,
			TokenName:    token.Name,
			CardType:     req.CardType,
			QuotaAdded:   quotaAdded,
			TimeAdded:    timeAdded,
			BeforeQuota:  beforeQuota,
			AfterQuota:   afterQuota,
			BeforeExpiry: beforeExpiry,
			AfterExpiry:  afterExpiry,
		}
		return tx.Create(record).Error
	})

	if err != nil {
		common.SysError("管理员分配订阅失败: " + err.Error())
		common.ApiErrorMsg(c, "分配失败，请稍后重试")
		return
	}

	model.RecordLog(adminId, model.LogTypeTopup,
		fmt.Sprintf("管理员分配订阅给用户 %s，令牌 %s，额度 %s",
			user.Username, token.Name, logger.LogQuota(quotaAdded)))

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"quota_added":  quotaAdded,
			"time_added":   timeAdded,
			"before_quota": beforeQuota,
			"after_quota":  afterQuota,
			"username":     user.Username,
			"token_name":   token.Name,
		},
	})
}
