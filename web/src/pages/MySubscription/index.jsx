import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Typography,
  Select,
  Space,
  Spin,
  Tag,
  Button,
  Popconfirm,
  Progress,
  Empty,
} from '@douyinfe/semi-ui';
import { IconRefresh } from '@douyinfe/semi-icons';
import { VChart } from '@visactor/react-vchart';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import {
  Clock,
  RefreshCw,
  CreditCard,
  TrendingUp,
  PieChart,
  Calendar,
  Zap,
} from 'lucide-react';

const { Text, Title } = Typography;

const MySubscriptionPage = () => {
  const { t } = useTranslation();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resetLoading, setResetLoading] = useState({});
  const [selectedSubId, setSelectedSubId] = useState(null);
  const [usageHistory, setUsageHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [days, setDays] = useState(30);

  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await API.get('/api/subscription/self/detail');
      if (res.data?.success) {
        const data = res.data.data || [];
        setSubscriptions(data);
        if (data.length > 0 && !selectedSubId) {
          setSelectedSubId(data[0].subscription?.id);
        }
      }
    } catch (e) {
      showError(e.message);
    }
  }, [selectedSubId]);

  const loadUsageHistory = useCallback(async () => {
    if (!selectedSubId) return;
    setHistoryLoading(true);
    try {
      const res = await API.get(
        `/api/subscription/self/usage-history?subscription_id=${selectedSubId}&days=${days}`,
      );
      if (res.data?.success) {
        setUsageHistory(res.data.data);
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setHistoryLoading(false);
    }
  }, [selectedSubId, days]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadSubscriptions();
      setLoading(false);
    };
    init();
  }, [loadSubscriptions]);

  useEffect(() => {
    loadUsageHistory();
  }, [loadUsageHistory]);

  const handleManualReset = async (subId) => {
    setResetLoading((prev) => ({ ...prev, [subId]: true }));
    try {
      const res = await API.post('/api/subscription/self/manual-reset', {
        subscription_id: subId,
      });
      if (res.data?.success) {
        showSuccess(t('重置成功'));
        await loadSubscriptions();
      } else {
        showError(res.data?.message || t('重置失败'));
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setResetLoading((prev) => ({ ...prev, [subId]: false }));
    }
  };

  const formatAmount = (v) => `$${(v || 0).toFixed(4)}`;

  const formatCountdown = (seconds) => {
    if (!seconds || seconds <= 0) return '--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 24) {
      const d = Math.floor(h / 24);
      return `${d}${t('天')} ${h % 24}${t('时')}`;
    }
    return `${h}${t('时')} ${m}${t('分')}`;
  };

  const getProgressColor = (percent) => {
    if (percent >= 85) return 'red';
    if (percent >= 60) return 'orange';
    return 'green';
  };

  const getStatusTag = (item) => {
    if (item.status === 'active' && item.expire_days > 0) {
      return (
        <Tag color="green" size="small">
          {t('生效中')}
        </Tag>
      );
    }
    if (item.status === 'expired') {
      return (
        <Tag color="grey" size="small">
          {t('已过期')}
        </Tag>
      );
    }
    if (item.status === 'cancelled') {
      return (
        <Tag color="red" size="small">
          {t('已取消')}
        </Tag>
      );
    }
    return (
      <Tag color="grey" size="small">
        {item.status}
      </Tag>
    );
  };

  const activeSubscriptions = subscriptions.filter(
    (s) => s.status === 'active' && s.expire_days > 0,
  );

  const lineSpec =
    usageHistory?.daily?.length > 0
      ? {
          type: 'line',
          data: [
            {
              id: 'daily',
              values: (usageHistory.daily || []).map((d) => ({
                date: d.date,
                amount: parseFloat(d.amount.toFixed(4)),
              })),
            },
          ],
          xField: 'date',
          yField: 'amount',
          point: { visible: true, size: 4 },
          line: { style: { curveType: 'monotone' } },
          axes: [
            { orient: 'bottom', label: { autoRotate: true } },
            { orient: 'left', label: { formatter: (v) => `$${v}` } },
          ],
          tooltip: {
            mark: {
              content: [
                {
                  key: (d) => d.date,
                  value: (d) => `$${d.amount}`,
                },
              ],
            },
          },
          title: { visible: false },
          padding: { top: 10, right: 20, bottom: 30, left: 50 },
        }
      : null;

  const pieSpec =
    usageHistory?.models?.length > 0
      ? {
          type: 'pie',
          data: [
            {
              id: 'model',
              values: (usageHistory.models || []).map((m) => ({
                model: m.model_name,
                amount: parseFloat(m.amount.toFixed(4)),
              })),
            },
          ],
          valueField: 'amount',
          categoryField: 'model',
          outerRadius: 0.8,
          innerRadius: 0.5,
          label: {
            visible: true,
            position: 'outside',
            style: { fontSize: 11 },
          },
          tooltip: {
            mark: {
              content: [
                {
                  key: (d) => d.model,
                  value: (d) => `$${d.amount}`,
                },
              ],
            },
          },
          title: { visible: false },
          legends: { visible: true, orient: 'right' },
          padding: { top: 10, right: 10, bottom: 10, left: 10 },
        }
      : null;

  if (loading) {
    return (
      <div className="mt-[60px] px-2 flex justify-center items-center h-64">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mt-[60px] px-2 space-y-4">
      <div className="flex items-center justify-between">
        <Title heading={4} className="!mb-0">
          {t('我的订阅')}
        </Title>
        <Button
          icon={<IconRefresh />}
          onClick={async () => {
            setLoading(true);
            await loadSubscriptions();
            setLoading(false);
          }}
        >
          {t('刷新')}
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <Empty description={t('暂无订阅')} />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {subscriptions.map((item) => (
              <Card
                key={item.subscription?.id}
                className="!rounded-2xl shadow-sm"
                bodyStyle={{ padding: '20px' }}
                style={{
                  border:
                    selectedSubId === item.subscription?.id
                      ? '2px solid var(--semi-color-primary)'
                      : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedSubId(item.subscription?.id)}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CreditCard size={18} className="text-blue-500" />
                    <Text strong className="text-base">
                      {item.plan_title || `#${item.subscription?.id}`}
                    </Text>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusTag(item)}
                    {item.expire_days > 0 && (
                      <Text type="tertiary" size="small">
                        {t('剩余')} {item.expire_days} {t('天')}
                      </Text>
                    )}
                  </div>
                </div>

                {item.plan_subtitle && (
                  <Text
                    type="tertiary"
                    size="small"
                    className="block mb-3"
                  >
                    {item.plan_subtitle}
                  </Text>
                )}

                {item.quota_per_cycle > 0 ? (
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <Text size="small">{t('当前周期额度')}</Text>
                      <Text size="small" strong>
                        ${(item.quota_used / 500000).toFixed(2)} / $
                        {item.quota_per_cycle_display?.toFixed(2)}
                      </Text>
                    </div>
                    <Progress
                      percent={Math.min(item.usage_percent || 0, 100)}
                      showInfo
                      stroke={getProgressColor(item.usage_percent || 0)}
                      size="large"
                      format={(p) => `${p.toFixed(1)}%`}
                    />
                  </div>
                ) : (
                  <div className="mb-3">
                    <Tag color="blue" size="small">
                      {t('无限额度')}
                    </Tag>
                  </div>
                )}

                {item.weekly_quota_enabled && (
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <Text size="small">{t('本周消耗限制')}</Text>
                      <Text size="small" strong>
                        ${(item.weekly_quota_used / 500000).toFixed(2)} / $
                        {item.weekly_quota_limit_display?.toFixed(2)}
                      </Text>
                    </div>
                    <Progress
                      percent={Math.min(item.weekly_usage_percent || 0, 100)}
                      showInfo
                      stroke={getProgressColor(item.weekly_usage_percent || 0)}
                      size="default"
                      format={(p) => `${p.toFixed(1)}%`}
                    />
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  {item.reset_period &&
                    item.reset_period !== 'never' && (
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        <Text type="tertiary" size="small">
                          {t('重置周期')}: {item.reset_period_label}
                        </Text>
                        {item.next_reset_countdown > 0 && (
                          <Text type="tertiary" size="small">
                            · {t('下次重置')}:{' '}
                            {formatCountdown(item.next_reset_countdown)}
                          </Text>
                        )}
                      </div>
                    )}

                  {item.manual_reset_enabled && (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RefreshCw size={14} className="text-gray-400" />
                        <Text type="tertiary" size="small">
                          {t('今日手动重置')}:{' '}
                          {item.manual_reset_limit -
                            item.manual_reset_remaining}
                          /{item.manual_reset_limit} {t('次已用')}
                        </Text>
                      </div>
                      <Popconfirm
                        title={t('确认重置')}
                        content={t(
                          '重置后当前周期已用额度将归零，确认继续？',
                        )}
                        onConfirm={() =>
                          handleManualReset(item.subscription?.id)
                        }
                        okText={t('确认')}
                        cancelText={t('取消')}
                      >
                        <Button
                          size="small"
                          theme="light"
                          type="warning"
                          loading={
                            resetLoading[item.subscription?.id]
                          }
                          disabled={
                            item.manual_reset_remaining <= 0 ||
                            item.status !== 'active'
                          }
                        >
                          {t('重置额度')}
                        </Button>
                      </Popconfirm>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {activeSubscriptions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp size={18} className="text-blue-500" />
                  <Title heading={5} className="!mb-0">
                    {t('消费趋势')}
                  </Title>
                </div>
                <Space>
                  {activeSubscriptions.length > 1 && (
                    <Select
                      value={selectedSubId}
                      onChange={setSelectedSubId}
                      style={{ width: 180 }}
                    >
                      {activeSubscriptions.map((s) => (
                        <Select.Option
                          key={s.subscription?.id}
                          value={s.subscription?.id}
                        >
                          {s.plan_title || `#${s.subscription?.id}`}
                        </Select.Option>
                      ))}
                    </Select>
                  )}
                  <Select
                    value={days}
                    onChange={setDays}
                    style={{ width: 110 }}
                  >
                    <Select.Option value={7}>
                      {t('近7天')}
                    </Select.Option>
                    <Select.Option value={14}>
                      {t('近14天')}
                    </Select.Option>
                    <Select.Option value={30}>
                      {t('近30天')}
                    </Select.Option>
                    <Select.Option value={60}>
                      {t('近60天')}
                    </Select.Option>
                    <Select.Option value={90}>
                      {t('近90天')}
                    </Select.Option>
                  </Select>
                </Space>
              </div>

              <Spin spinning={historyLoading}>
                <Card
                  title={
                    <div className="flex items-center gap-2">
                      <Calendar size={16} />
                      {t('每日消费趋势')}
                    </div>
                  }
                >
                  {lineSpec ? (
                    <div style={{ height: 300 }}>
                      <VChart
                        spec={lineSpec}
                        style={{ height: '100%', width: '100%' }}
                      />
                    </div>
                  ) : (
                    <div className="h-48 flex items-center justify-center">
                      <Text type="tertiary">{t('暂无数据')}</Text>
                    </div>
                  )}
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                  <Card
                    title={
                      <div className="flex items-center gap-2">
                        <PieChart size={16} />
                        {t('按模型分布')}
                      </div>
                    }
                  >
                    {pieSpec ? (
                      <div style={{ height: 300 }}>
                        <VChart
                          spec={pieSpec}
                          style={{ height: '100%', width: '100%' }}
                        />
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center">
                        <Text type="tertiary">
                          {t('暂无数据')}
                        </Text>
                      </div>
                    )}
                  </Card>

                  <Card
                    title={
                      <div className="flex items-center gap-2">
                        <Zap size={16} />
                        {t('使用统计')}
                      </div>
                    }
                  >
                    {usageHistory?.daily?.length > 0 ? (
                      <div className="space-y-3 p-2">
                        <div className="flex justify-between">
                          <Text type="tertiary">
                            {t('总消费')}
                          </Text>
                          <Text strong>
                            {formatAmount(
                              usageHistory.daily.reduce(
                                (s, d) => s + d.amount,
                                0,
                              ),
                            )}
                          </Text>
                        </div>
                        <div className="flex justify-between">
                          <Text type="tertiary">
                            {t('总请求数')}
                          </Text>
                          <Text strong>
                            {usageHistory.daily
                              .reduce(
                                (s, d) => s + d.request_count,
                                0,
                              )
                              .toLocaleString()}
                          </Text>
                        </div>
                        <div className="flex justify-between">
                          <Text type="tertiary">
                            {t('日均消费')}
                          </Text>
                          <Text strong>
                            {formatAmount(
                              usageHistory.daily.reduce(
                                (s, d) => s + d.amount,
                                0,
                              ) / usageHistory.daily.length,
                            )}
                          </Text>
                        </div>
                        <div className="flex justify-between">
                          <Text type="tertiary">
                            {t('模型数量')}
                          </Text>
                          <Text strong>
                            {usageHistory.models?.length || 0}
                          </Text>
                        </div>
                      </div>
                    ) : (
                      <div className="h-48 flex items-center justify-center">
                        <Text type="tertiary">
                          {t('暂无数据')}
                        </Text>
                      </div>
                    )}
                  </Card>
                </div>
              </Spin>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default MySubscriptionPage;
