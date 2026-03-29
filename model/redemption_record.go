package model

import (
	"github.com/QuantumNous/new-api/common"
)

type RedemptionRecord struct {
	Id           int    `json:"id"`
	CardId       int    `json:"card_id" gorm:"index"`
	CardCode     string `json:"card_code"`
	UserId       int    `json:"user_id" gorm:"index"`
	Username     string `json:"username"`
	TokenId      int    `json:"token_id" gorm:"index"`
	TokenName    string `json:"token_name"`
	CardType     string `json:"card_type"`
	QuotaAdded   int    `json:"quota_added"`
	TimeAdded    int    `json:"time_added"`
	BeforeQuota  int    `json:"before_quota"`
	AfterQuota   int    `json:"after_quota"`
	BeforeExpiry int64  `json:"before_expiry"`
	AfterExpiry  int64  `json:"after_expiry"`
	CreatedTime  int64  `json:"created_time" gorm:"bigint"`
	Revoked      bool   `json:"revoked" gorm:"default:false"`
	RevokedTime  int64  `json:"revoked_time" gorm:"bigint"`
	RevokedBy    int    `json:"revoked_by"`
	RevokeReason string `json:"revoke_reason" gorm:"type:varchar(255)"`
}

func CreateRedemptionRecord(record *RedemptionRecord) error {
	record.CreatedTime = common.GetTimestamp()
	return DB.Create(record).Error
}

func GetRedemptionRecordsByUserId(userId int, startIdx int, num int) (records []*RedemptionRecord, total int64, err error) {
	tx := DB.Model(&RedemptionRecord{}).Where("user_id = ?", userId)
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&records).Error
	return records, total, err
}

func GetAllRedemptionRecords(startIdx int, num int) (records []*RedemptionRecord, total int64, err error) {
	tx := DB.Model(&RedemptionRecord{})
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&records).Error
	return records, total, err
}

func GetRedemptionRecordById(id int) (*RedemptionRecord, error) {
	record := &RedemptionRecord{}
	err := DB.First(record, "id = ?", id).Error
	return record, err
}

func GetRedemptionRecordByCardId(cardId int) (*RedemptionRecord, error) {
	record := &RedemptionRecord{}
	err := DB.Where("card_id = ? AND revoked = ?", cardId, false).First(record).Error
	return record, err
}
