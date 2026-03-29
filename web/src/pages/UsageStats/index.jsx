import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Select,
  Space,
  Spin,
  Table,
  Tag,
} from '@douyinfe/semi-ui';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import {
  Wallet,
  TrendingUp,
  Calendar,
  Activity,
} from 'lucide-react';

const { Text } = Typography;

const UsageStatsPage = () => {
  const { t } = useTranslation();
  const [overview, setOverview] = useState(null);
  const [dailyCost, setDailyCost] = useState([]);
  const [modelStats, setModelStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const loadOverview = useCallback(async () => {
    try {
      const res = await API.get('/api/user/usage-overview');
      if (res.data.success) {
        setOverview(res.data.data);
      }
    } catch (e) { /* ignore */ }
  }, []);

  const loadDailyCost = useCallback(async () => {
    try {
      const res = await API.get(`/api/user/daily-cost?days=${days}`);
      if (res.data.success) {
        setDailyCost((res.data.data || []).reverse());
      }
    } catch (e) { showError(e.message); }
  }, [days]);

  const loadModelStats = useCallback(async () => {
    try {
      const res = await API.get(`/api/user/model-stats?days=${days}`);
      if (res.data.success) {
        setModelStats(res.data.data || []);
      }
    } catch (e) { showError(e.message); }
  }, [days]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([loadOverview(), loadDailyCost(), loadModelStats()]);
      setLoading(false);
    };
    load();
  }, [loadOverview, loadDailyCost, loadModelStats]);

  const formatAmount = (v) => `$${(v || 0).toFixed(4)}`;

  const lineSpec = {
    type: 'line',
    data: [{ id: 'daily', values: dailyCost.map(d => ({ date: d.date, amount: parseFloat(d.amount.toFixed(4)) })) }],
    xField: 'date',
    yField: 'amount',
    point: { visible: true, size: 4 },
    line: { style: { curveType: 'monotone' } },
    axes: [
      { orient: 'bottom', label: { autoRotate: true } },
      { orient: 'left', label: { formatter: (v) => `$${v}` } },
    ],
    tooltip: {
      mark: { content: [{ key: (d) => d.date, value: (d) => `$${d.amount}` }] },
    },
    title: { visible: false },
    padding: { top: 10, right: 20, bottom: 30, left: 50 },
  };

  const pieSpec = {
    type: 'pie',
    data: [{ id: 'model', values: modelStats.map(m => ({ model: m.model_name, amount: parseFloat(m.amount.toFixed(4)) })) }],
    valueField: 'amount',
    categoryField: 'model',
    outerRadius: 0.8,
    innerRadius: 0.5,
    label: { visible: true, position: 'outside', style: { fontSize: 11 } },
    tooltip: {
      mark: { content: [{ key: (d) => d.model, value: (d) => `$${d.amount}` }] },
    },
    title: { visible: false },
    legends: { visible: true, orient: 'right' },
    padding: { top: 10, right: 10, bottom: 10, left: 10 },
  };

  const modelColumns = [
    { title: t('模型'), dataIndex: 'model_name', width: 200 },
    { title: t('消费($)'), dataIndex: 'amount', width: 120, render: (v) => formatAmount(v) },
    { title: t('请求数'), dataIndex: 'request_count', width: 100 },
    { title: t('Token数'), dataIndex: 'token_count', width: 120, render: (v) => (v || 0).toLocaleString() },
    {
      title: t('占比'), width: 100, render: (_, record) => {
        const total = modelStats.reduce((s, m) => s + m.amount, 0);
        const pct = total > 0 ? ((record.amount / total) * 100).toFixed(1) : '0.0';
        return <Tag>{pct}%</Tag>;
      },
    },
  ];

  if (loading) {
    return (
      <div className='mt-[60px] px-2 flex justify-center items-center h-64'>
        <Spin size='large' />
      </div>
    );
  }

  return (
    <div className='mt-[60px] px-2 space-y-4'>
      {/* 概览卡片 */}
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3'>
        <Card bodyStyle={{ padding: '16px' }}>
          <div className='flex items-center gap-2 mb-2'>
            <Wallet size={16} className='text-blue-500' />
            <Text type='tertiary' size='small'>{t('账户余额')}</Text>
          </div>
          <div className='text-xl font-bold'>{formatAmount(overview?.total_amount - overview?.used_amount)}</div>
        </Card>
        <Card bodyStyle={{ padding: '16px' }}>
          <div className='flex items-center gap-2 mb-2'>
            <Activity size={16} className='text-green-500' />
            <Text type='tertiary' size='small'>{t('今日消费')}</Text>
          </div>
          <div className='text-xl font-bold'>{formatAmount(overview?.today_amount)}</div>
          <Text type='tertiary' size='small'>{overview?.today_requests || 0} {t('次请求')}</Text>
        </Card>
        <Card bodyStyle={{ padding: '16px' }}>
          <div className='flex items-center gap-2 mb-2'>
            <Calendar size={16} className='text-orange-500' />
            <Text type='tertiary' size='small'>{t('本月消费')}</Text>
          </div>
          <div className='text-xl font-bold'>{formatAmount(overview?.month_amount)}</div>
          <Text type='tertiary' size='small'>{overview?.month_requests || 0} {t('次请求')}</Text>
        </Card>
        <Card bodyStyle={{ padding: '16px' }}>
          <div className='flex items-center gap-2 mb-2'>
            <TrendingUp size={16} className='text-red-500' />
            <Text type='tertiary' size='small'>{t('累计消费')}</Text>
          </div>
          <div className='text-xl font-bold'>{formatAmount(overview?.used_amount)}</div>
        </Card>
      </div>

      {/* 时间范围选择 */}
      <div className='flex justify-end'>
        <Select value={days} onChange={setDays} style={{ width: 120 }}>
          <Select.Option value={7}>{t('近7天')}</Select.Option>
          <Select.Option value={14}>{t('近14天')}</Select.Option>
          <Select.Option value={30}>{t('近30天')}</Select.Option>
          <Select.Option value={60}>{t('近60天')}</Select.Option>
          <Select.Option value={90}>{t('近90天')}</Select.Option>
        </Select>
      </div>

      {/* 每日消费折线图 */}
      <Card title={t('每日消费趋势')}>
        {dailyCost.length > 0 ? (
          <div style={{ height: 300 }}>
            <VChart spec={lineSpec} style={{ height: '100%', width: '100%' }} />
          </div>
        ) : (
          <div className='h-48 flex items-center justify-center'>
            <Text type='tertiary'>{t('暂无数据')}</Text>
          </div>
        )}
      </Card>

      {/* 模型消费分布 */}
      <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
        <Card title={t('模型消费分布')}>
          {modelStats.length > 0 ? (
            <div style={{ height: 300 }}>
              <VChart spec={pieSpec} style={{ height: '100%', width: '100%' }} />
            </div>
          ) : (
            <div className='h-48 flex items-center justify-center'>
              <Text type='tertiary'>{t('暂无数据')}</Text>
            </div>
          )}
        </Card>
        <Card title={t('模型消费明细')}>
          <Table
            columns={modelColumns}
            dataSource={modelStats}
            pagination={false}
            rowKey='model_name'
            size='small'
          />
        </Card>
      </div>
    </div>
  );
};

export default UsageStatsPage;
