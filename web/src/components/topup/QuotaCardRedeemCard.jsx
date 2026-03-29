import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  Button,
  Typography,
  Select,
  Modal,
  Tag,
  Banner,
  Descriptions,
} from '@douyinfe/semi-ui';
import { Ticket } from 'lucide-react';
import { API, showError, showSuccess, renderQuota } from '../../helpers';

const { Text } = Typography;

const QuotaCardRedeemCard = ({ t, onRedeemSuccess }) => {
  const [cardCode, setCardCode] = useState('');
  const [tokenId, setTokenId] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tokensLoading, setTokensLoading] = useState(false);

  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setTokensLoading(true);
    try {
      const res = await API.get('/api/token/?p=0&size=100');
      const { success, data } = res.data;
      if (success) {
        const list = Array.isArray(data) ? data : data?.data || [];
        setTokens(list.filter((tk) => tk.status === 1));
      }
    } catch (e) {
      // 静默处理
    }
    setTokensLoading(false);
  };

  const handleRedeem = async () => {
    if (!cardCode.trim()) {
      showError(t('请输入额度卡码'));
      return;
    }
    if (!tokenId) {
      showError(t('请选择目标令牌'));
      return;
    }
    setLoading(true);
    try {
      const res = await API.post('/api/user/redeem-card', {
        code: cardCode.trim(),
        token_id: tokenId,
      });
      const { success, message, data } = res.data;
      if (success) {
        const info = data || {};
        Modal.success({
          title: t('兑换成功'),
          content: (
            <Descriptions
              data={[
                info.quota_added > 0 && {
                  key: t('增加额度'),
                  value: renderQuota(info.quota_added),
                },
                info.time_added && {
                  key: t('增加时间'),
                  value: info.time_added,
                },
                {
                  key: t('目标令牌'),
                  value: info.token_name || '-',
                },
              ].filter(Boolean)}
              row
              size="small"
            />
          ),
          centered: true,
        });
        setCardCode('');
        setTokenId(null);
        onRedeemSuccess && onRedeemSuccess();
      } else {
        showError(message);
      }
    } catch (e) {
      showError(t('兑换请求失败'));
    }
    setLoading(false);
  };

  return (
    <Card
      className="!rounded-xl w-full"
      title={
        <div className="flex items-center gap-2">
          <Ticket size={16} />
          <Text type="tertiary" strong>
            {t('额度卡兑换')}
          </Text>
        </div>
      }
    >
      <Banner
        type="info"
        description={t('使用额度卡可为指定令牌充值额度或延长有效期')}
        className="!rounded-xl mb-4"
        closeIcon={null}
      />
      <Form layout="vertical">
        <Form.Slot noLabel>
          <Select
            placeholder={t('选择目标令牌')}
            value={tokenId}
            onChange={setTokenId}
            loading={tokensLoading}
            style={{ width: '100%' }}
            optionList={tokens.map((tk) => ({
              value: tk.id,
              label: (
                <div className="flex items-center justify-between w-full">
                  <span>{tk.name}</span>
                  <Tag size="small" color="blue">
                    {renderQuota(tk.remain_quota)}
                  </Tag>
                </div>
              ),
            }))}
            filter
            showClear
          />
        </Form.Slot>

        <Form.Input
          field="cardCode"
          noLabel
          placeholder={t('请输入额度卡码')}
          value={cardCode}
          onChange={setCardCode}
          prefix={<Ticket size={14} />}
          suffix={
            <Button
              type="primary"
              theme="solid"
              onClick={handleRedeem}
              loading={loading}
              disabled={!cardCode.trim() || !tokenId}
            >
              {t('兑换')}
            </Button>
          }
          showClear
          style={{ width: '100%' }}
        />
      </Form>
    </Card>
  );
};

export default QuotaCardRedeemCard;
