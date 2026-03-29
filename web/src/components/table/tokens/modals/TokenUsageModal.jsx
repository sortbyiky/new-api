import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Typography,
  Spin,
  Table,
  Tag,
  Descriptions,
  Space,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';
import { API, showError, renderQuota } from '../../../../helpers';

const { Text } = Typography;

const TokenUsageModal = ({ visible, tokenId, onClose }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [tokenStats, setTokenStats] = useState(null);
  const [dailyCost, setDailyCost] = useState([]);
  const [modelStats, setModelStats] = useState([]);

  const loadData = useCallback(async () => {
    if (!tokenId) return;
    setLoading(true);
    try {
      const [statsRes, dailyRes, modelRes] = await Promise.all([
        API.get(`/api/usage/token/${tokenId}/stats`),
        API.get(`/api/usage/token/${tokenId}/daily?days=30`),
        API.get(`/api/user/model-stats?days=30&token_id=${tokenId}`),
      ]);
      if (statsRes.data.success) setTokenStats(statsRes.data.data);
      if (dailyRes.data.success) setDailyCost((dailyRes.data.data || []).reverse());
      if (modelRes.data.success) setModelStats(modelRes.data.data || []);
    } catch (e) {
      showError(e.message);
    }
    setLoading(false);
  }, [tokenId]);

  useEffect(() => {
    if (visible && tokenId) loadData();
  }, [visible, tokenId, loadData]);

  const formatAmount = (v) => `$${(v || 0).toFixed(4)}`;

  const lineSpec = {
    type: 'line',
    data: [{ id: 'daily', values: dailyCost.map(d => ({ date: d.date, amount: parseFloat(d.amount.toFixed(4)) })) }],
    xField: 'date',
    yField: 'amount',
    point: { visible: true, size: 3 },
    line: { style: { curveType: 'monotone' } },
    axes: [
      { orient: 'bottom', label: { autoRotate: true, style: { fontSize: 10 } } },
      { orient: 'left', label: { formatter: (v) => `$${v}` } },
    ],
    title: { visible: false },
    padding: { top: 10, right: 20, bottom: 30, left: 50 },
  };

  const modelColumns = [
    { title: t('模型'), dataIndex: 'model_name', width: 180 },
    { title: t('消费'), dataIndex: 'amount', width: 100, render: (v) => formatAmount(v) },
    { title: t('请求数'), dataIndex: 'request_count', width: 80 },
    { title: t('Token数'), dataIndex: 'token_count', width: 100, render: (v) => (v || 0).toLocaleString() },
  ];

  return (
    <Modal
      title={t('令牌用量详情')}
      visible={visible}
      onCancel={onClose}
      footer={null}
      width={680}
      style={{ maxHeight: '80vh' }}
      bodyStyle={{ overflow: 'auto', maxHeight: 'calc(80vh - 60px)' }}
    >
      {loading ? (
        <div className='flex justify-center items-center h-48'>
          <Spin size='large' />
        </div>
      ) : (
        <div className='space-y-4'>
          {tokenStats && (
            <Descriptions
              data={[
                { key: t('令牌名称'), value: tokenStats.token_name },
                { key: t('剩余额度'), value: `${renderQuota(tokenStats.remain_quota)} (${formatAmount(tokenStats.remain_amount)})` },
                { key: t('已用额度'), value: `${renderQuota(tokenStats.used_quota)} (${formatAmount(tokenStats.used_amount)})` },
                { key: t('额度类型'), value: tokenStats.unlimited ? <Tag color='green'>{t('无限额度')}</Tag> : t('有限额度') },
                { key: t('状态'), value: tokenStats.status === 1 ? <Tag color='green'>{t('启用')}</Tag> : <Tag color='red'>{t('禁用')}</Tag> },
              ]}
              row
              size='small'
            />
          )}

          <div>
            <Text strong className='mb-2 block'>{t('近30天每日消费')}</Text>
            {dailyCost.length > 0 ? (
              <div style={{ height: 220 }}>
                <VChart spec={lineSpec} style={{ height: '100%', width: '100%' }} />
              </div>
            ) : (
              <div className='h-32 flex items-center justify-center'>
                <Text type='tertiary'>{t('暂无数据')}</Text>
              </div>
            )}
          </div>

          <div>
            <Text strong className='mb-2 block'>{t('按模型消费明细')}</Text>
            <Table
              columns={modelColumns}
              dataSource={modelStats}
              pagination={false}
              rowKey='model_name'
              size='small'
              empty={<Text type='tertiary'>{t('暂无数据')}</Text>}
            />
          </div>
        </div>
      )}
    </Modal>
  );
};

export default TokenUsageModal;
