package model

import (
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strconv"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	QuotaCardStatusUnused   = 1
	QuotaCardStatusRedeemed = 2
	QuotaCardStatusRevoked  = 3

	QuotaCardTypeQuota = "quota"
	QuotaCardTypeTime  = "time"
	QuotaCardTypeCombo = "combo"
)

type QuotaCard struct {
	Id            int            `json:"id"`
	Code          string         `json:"code" gorm:"type:varchar(20);uniqueIndex"`
	Name          string         `json:"name" gorm:"index"`
	CardType      string         `json:"card_type" gorm:"type:varchar(10);default:'quota'"`
	QuotaAmount   int            `json:"quota_amount" gorm:"default:0"`
	TimeAmount    int            `json:"time_amount" gorm:"default:0"`
	TimeUnit      string         `json:"time_unit" gorm:"type:varchar(10);default:'days'"`
	Status        int            `json:"status" gorm:"default:1"`
	CreatedBy     int            `json:"created_by"`
	CreatedTime   int64          `json:"created_time" gorm:"bigint"`
	ExpiredTime   int64          `json:"expired_time" gorm:"bigint"`
	RedeemedBy    int            `json:"redeemed_by" gorm:"default:0"`
	RedeemedTime  int64          `json:"redeemed_time" gorm:"bigint"`
	TargetTokenId int            `json:"target_token_id" gorm:"default:0"`
	DeletedAt     gorm.DeletedAt `gorm:"index"`
	Count         int            `json:"count" gorm:"-:all"`
}

// 卡密字符集，去除易混淆的 0/O/1/I/L
const cardCodeChars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

func GenerateCardCode() string {
	code := make([]byte, 12)
	for i := 0; i < 12; i++ {
		n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(cardCodeChars))))
		code[i] = cardCodeChars[n.Int64()]
	}
	return fmt.Sprintf("CC_%s_%s_%s", string(code[0:4]), string(code[4:8]), string(code[8:12]))
}

func CreateQuotaCard(card *QuotaCard) error {
	card.Code = GenerateCardCode()
	card.CreatedTime = common.GetTimestamp()
	card.Status = QuotaCardStatusUnused
	return DB.Create(card).Error
}

func CreateQuotaCardsBatch(cards []*QuotaCard) error {
	for _, card := range cards {
		card.Code = GenerateCardCode()
		card.CreatedTime = common.GetTimestamp()
		card.Status = QuotaCardStatusUnused
	}
	return DB.Create(&cards).Error
}

func GetAllQuotaCards(status int, startIdx int, num int) (cards []*QuotaCard, total int64, err error) {
	tx := DB.Model(&QuotaCard{})
	if status != 0 {
		tx = tx.Where("status = ?", status)
	}
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&cards).Error
	return cards, total, err
}

func SearchQuotaCards(keyword string, startIdx int, num int) (cards []*QuotaCard, total int64, err error) {
	tx := DB.Model(&QuotaCard{})
	if id, parseErr := strconv.Atoi(keyword); parseErr == nil {
		tx = tx.Where("id = ? OR code LIKE ? OR name LIKE ?", id, "%"+keyword+"%", keyword+"%")
	} else {
		tx = tx.Where("code LIKE ? OR name LIKE ?", "%"+keyword+"%", keyword+"%")
	}
	err = tx.Count(&total).Error
	if err != nil {
		return nil, 0, err
	}
	err = tx.Order("id desc").Limit(num).Offset(startIdx).Find(&cards).Error
	return cards, total, err
}

func GetQuotaCardByCode(code string) (*QuotaCard, error) {
	card := &QuotaCard{}
	err := DB.Where("code = ?", code).First(card).Error
	if err != nil {
		return nil, err
	}
	return card, nil
}

func GetQuotaCardById(id int) (*QuotaCard, error) {
	card := &QuotaCard{}
	err := DB.First(card, "id = ?", id).Error
	return card, err
}

func DeleteQuotaCardById(id int) error {
	card, err := GetQuotaCardById(id)
	if err != nil {
		return err
	}
	if card.Status != QuotaCardStatusUnused {
		return errors.New("只能删除未使用的额度卡")
	}
	return DB.Delete(card).Error
}

type QuotaCardStats struct {
	Total    int64 `json:"total"`
	Unused   int64 `json:"unused"`
	Redeemed int64 `json:"redeemed"`
	Revoked  int64 `json:"revoked"`
}

func GetQuotaCardStats() (*QuotaCardStats, error) {
	stats := &QuotaCardStats{}
	err := DB.Model(&QuotaCard{}).Count(&stats.Total).Error
	if err != nil {
		return nil, err
	}
	DB.Model(&QuotaCard{}).Where("status = ?", QuotaCardStatusUnused).Count(&stats.Unused)
	DB.Model(&QuotaCard{}).Where("status = ?", QuotaCardStatusRedeemed).Count(&stats.Redeemed)
	DB.Model(&QuotaCard{}).Where("status = ?", QuotaCardStatusRevoked).Count(&stats.Revoked)
	return stats, nil
}
