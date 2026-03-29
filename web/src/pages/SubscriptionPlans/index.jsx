import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Badge,
  Button,
  Card,
  Divider,
  Empty,
  Skeleton,
  Space,
  Tag,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  API,
  showError,
  showSuccess,
  renderQuota,
} from '../../helpers';
import { getCurrencyConfig } from '../../helpers/render';
import {
  formatSubscriptionDuration,
  formatSubscriptionResetPeriod,
} from '../../helpers/subscriptionFormat';
import {
  Crown,
  Sparkles,
  Zap,
  Shield,
  Clock,
  RefreshCw,
  Check,
  ArrowRight,
  Star,
} from 'lucide-react';
import SubscriptionPurchaseModal from '../../components/topup/modals/SubscriptionPurchaseModal';

const { Title, Text } = Typography;

function getEpayMethods(payMethods = []) {
  return (payMethods || []).filter(
    (m) => m?.type && m.type !== 'stripe' && m.type !== 'creem',
  );
}

function submitEpayForm({ url, params }) {
  const form = document.createElement('form');
  form.action = url;
  form.method = 'POST';
  const isSafari =
    navigator.userAgent.indexOf('Safari') > -1 &&
    navigator.userAgent.indexOf('Chrome') < 1;
  if (!isSafari) form.target = '_blank';
  Object.keys(params).forEach((key) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = params[key];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
}

const GRADIENT_PRESETS = [
  'from-violet-500 to-purple-600',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-pink-500 to-rose-500',
  'from-indigo-500 to-blue-500',
];

const SubscriptionPlansPage = () => {
  const { t } = useTranslation();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payMethods, setPayMethods] = useState([]);
  const [enableOnlineTopUp, setEnableOnlineTopUp] = useState(false);
  const [enableStripeTopUp, setEnableStripeTopUp] = useState(false);
  const [enableCreemTopUp, setEnableCreemTopUp] = useState(false);
  const [activeSubscriptions, setActiveSubscriptions] = useState([]);

  const [open, setOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paying, setPaying] = useState(false);
  const [selectedEpayMethod, setSelectedEpayMethod] = useState('');

  const epayMethods = useMemo(() => getEpayMethods(payMethods), [payMethods]);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/plans');
      if (res.data?.success) {
        setPlans(res.data.data || []);
      }
    } catch (e) {
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPaymentConfig = useCallback(async () => {
    try {
      const res = await API.get('/api/user/topup/info');
      if (res.data?.success) {
        const data = res.data.data;
        let methods = data.pay_methods || [];
        if (typeof methods === 'string') methods = JSON.parse(methods);
        methods = (methods || []).filter((m) => m.name && m.type);
        setPayMethods(methods);
        setEnableOnlineTopUp(data.enable_online_topup || false);
        setEnableStripeTopUp(data.enable_stripe_topup || false);
        setEnableCreemTopUp(data.enable_creem_topup || false);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchSubscriptionSelf = useCallback(async () => {
    try {
      const res = await API.get('/api/subscription/self');
      if (res.data?.success) {
        setActiveSubscriptions(res.data.data?.subscriptions || []);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPlans();
    fetchPaymentConfig();
    fetchSubscriptionSelf();
  }, [fetchPlans, fetchPaymentConfig, fetchSubscriptionSelf]);

  const getPlanPurchaseCount = (planId) => {
    return activeSubscriptions.filter(
      (s) => s.plan_id === planId && s.status === 'active',
    ).length;
  };

  const openBuy = (p) => {
    setSelectedPlan(p);
    setSelectedEpayMethod(epayMethods?.[0]?.type || '');
    setOpen(true);
  };

  const closeBuy = () => {
    setOpen(false);
    setSelectedPlan(null);
    setPaying(false);
  };

  const payStripe = async () => {
    if (!selectedPlan?.plan?.stripe_price_id) {
      showError(t('该套餐未配置 Stripe'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/stripe/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.pay_link, '_blank');
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        showError(
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败'),
        );
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payCreem = async () => {
    if (!selectedPlan?.plan?.creem_product_id) {
      showError(t('该套餐未配置 Creem'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/creem/pay', {
        plan_id: selectedPlan.plan.id,
      });
      if (res.data?.message === 'success') {
        window.open(res.data.data?.checkout_url, '_blank');
        showSuccess(t('已打开支付页面'));
        closeBuy();
      } else {
        showError(
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败'),
        );
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const payEpay = async () => {
    if (!selectedEpayMethod) {
      showError(t('请选择支付方式'));
      return;
    }
    setPaying(true);
    try {
      const res = await API.post('/api/subscription/epay/pay', {
        plan_id: selectedPlan.plan.id,
        payment_method: selectedEpayMethod,
      });
      if (res.data?.message === 'success') {
        submitEpayForm({ url: res.data.url, params: res.data.data });
        showSuccess(t('已发起支付'));
        closeBuy();
      } else {
        showError(
          typeof res.data?.data === 'string'
            ? res.data.data
            : res.data?.message || t('支付失败'),
        );
      }
    } catch (e) {
      showError(t('支付请求失败'));
    } finally {
      setPaying(false);
    }
  };

  const renderPlanCard = (p, index) => {
    const plan = p?.plan;
    const totalAmount = Number(plan?.total_amount || 0);
    const { symbol, rate } = getCurrencyConfig();
    const price = Number(plan?.price_amount || 0);
    const convertedPrice = price * rate;
    const displayPrice = convertedPrice.toFixed(
      Number.isInteger(convertedPrice) ? 0 : 2,
    );
    const isPopular = index === 0 && plans.length > 1;
    const limit = Number(plan?.max_purchase_per_user || 0);
    const count = getPlanPurchaseCount(plan?.id);
    const reached = limit > 0 && count >= limit;

    const hasResetPeriod =
      formatSubscriptionResetPeriod(plan, t) !== t('不重置');
    const resetPeriodText = hasResetPeriod
      ? formatSubscriptionResetPeriod(plan, t)
      : null;
    const weeklyQuotaLimit = Number(plan?.weekly_quota_limit || 0);
    const manualResetLimit = Number(plan?.manual_daily_reset_limit || 0);

    const gradient = GRADIENT_PRESETS[index % GRADIENT_PRESETS.length];

    const benefits = [
      {
        icon: <Clock size={14} />,
        label: formatSubscriptionDuration(plan, t),
        desc: t('有效期'),
      },
      hasResetPeriod
        ? {
            icon: <RefreshCw size={14} />,
            label:
              totalAmount > 0
                ? `${resetPeriodText} · ${renderQuota(totalAmount)}`
                : resetPeriodText,
            desc: t('额度重置'),
          }
        : totalAmount > 0
          ? {
              icon: <Zap size={14} />,
              label: renderQuota(totalAmount),
              desc: t('总额度'),
            }
          : {
              icon: <Zap size={14} />,
              label: t('不限'),
              desc: t('总额度'),
            },
      weeklyQuotaLimit > 0
        ? {
            icon: <Shield size={14} />,
            label: renderQuota(weeklyQuotaLimit),
            desc: t('周消耗上限'),
          }
        : null,
      manualResetLimit > 0
        ? {
            icon: <RefreshCw size={14} />,
            label: `${manualResetLimit} ${t('次/天')}`,
            desc: t('手动重置'),
          }
        : null,
      plan?.upgrade_group
        ? {
            icon: <Star size={14} />,
            label: plan.upgrade_group,
            desc: t('升级分组'),
          }
        : null,
    ].filter(Boolean);

    return (
      <div
        key={plan?.id}
        className={`relative group ${isPopular ? 'lg:-mt-2 lg:mb-2' : ''}`}
      >
        {isPopular && (
          <div className='absolute -top-3 left-1/2 -translate-x-1/2 z-10'>
            <Tag
              color='purple'
              shape='circle'
              size='large'
              style={{
                padding: '2px 16px',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(139, 92, 246, 0.3)',
              }}
            >
              <Sparkles size={12} className='mr-1' />
              {t('推荐')}
            </Tag>
          </div>
        )}
        <Card
          className={`!rounded-2xl transition-all duration-300 h-full
            hover:shadow-xl hover:-translate-y-1
            ${isPopular ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-100' : 'hover:shadow-lg'}`}
          bodyStyle={{ padding: 0 }}
        >
          <div className='flex flex-col h-full'>
            {/* 顶部渐变区域 */}
            <div
              className={`bg-gradient-to-br ${gradient} px-6 pt-8 pb-6 text-white ${isPopular ? 'rounded-t-[14px]' : 'rounded-t-2xl'}`}
            >
              <Text
                className='!text-white/80 text-xs font-medium uppercase tracking-wider'
                style={{ color: 'rgba(255,255,255,0.8)' }}
              >
                {plan?.subtitle || t('订阅套餐')}
              </Text>
              <Title
                heading={4}
                className='!text-white !mt-1 !mb-4'
                style={{ color: '#fff', margin: '4px 0 16px' }}
                ellipsis={{ rows: 1, showTooltip: true }}
              >
                {plan?.title || t('订阅套餐')}
              </Title>
              <div className='flex items-baseline gap-1'>
                <span className='text-lg font-medium opacity-80'>{symbol}</span>
                <span className='text-4xl font-extrabold tracking-tight'>
                  {displayPrice}
                </span>
                <span className='text-sm opacity-70 ml-1'>
                  / {formatSubscriptionDuration(plan, t)}
                </span>
              </div>
            </div>

            {/* 权益列表 */}
            <div className='px-6 py-5 flex-1'>
              <div className='space-y-4'>
                {benefits.map((b, i) => (
                  <div key={i} className='flex items-center gap-3'>
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center`}
                      style={{ opacity: 0.15 }}
                    >
                    </div>
                    <div
                      className={`absolute flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center`}
                    >
                      <span className='text-gray-700'>{b.icon}</span>
                    </div>
                    <div className='ml-8 min-w-0'>
                      <div className='text-sm font-medium text-gray-800 truncate'>
                        {b.label}
                      </div>
                      <div className='text-xs text-gray-400'>{b.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 底部操作 */}
            <div className='px-6 pb-6'>
              {limit > 0 && (
                <div className='text-xs text-gray-400 text-center mb-3'>
                  {t('限购')} {limit} · {t('已购')} {count}
                </div>
              )}
              <Tooltip
                content={
                  reached
                    ? t('已达到购买上限') + ` (${count}/${limit})`
                    : ''
                }
                position='top'
                disabled={!reached}
              >
                <Button
                  theme='solid'
                  size='large'
                  block
                  disabled={reached}
                  className={`!rounded-xl !h-12 !font-semibold !text-base ${
                    isPopular
                      ? '!bg-gradient-to-r !from-purple-500 !to-violet-600 hover:!from-purple-600 hover:!to-violet-700'
                      : ''
                  }`}
                  style={
                    isPopular
                      ? {
                          background:
                            'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                          border: 'none',
                        }
                      : {}
                  }
                  onClick={() => !reached && openBuy(p)}
                >
                  {reached ? (
                    t('已达上限')
                  ) : (
                    <span className='flex items-center justify-center gap-2'>
                      {t('立即订阅')}
                      <ArrowRight size={16} />
                    </span>
                  )}
                </Button>
              </Tooltip>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <div className='max-w-6xl mx-auto px-4 py-8'>
      {/* 页面头部 */}
      <div className='text-center mb-12'>
        <div className='inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-50 text-purple-600 text-sm font-medium mb-4'>
          <Crown size={16} />
          {t('订阅套餐')}
        </div>
        <Title heading={2} style={{ margin: '0 0 8px' }}>
          {t('选择适合你的套餐')}
        </Title>
        <Text type='tertiary' size='normal' className='max-w-lg mx-auto block'>
          {t('订阅套餐享受专属模型权益，额度自动重置，省心省力')}
        </Text>
      </div>

      {/* 套餐卡片网格 */}
      {loading ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8'>
          {[1, 2, 3].map((i) => (
            <Card key={i} className='!rounded-2xl' bodyStyle={{ padding: 0 }}>
              <div className='h-40 bg-gray-100 rounded-t-2xl' />
              <div className='p-6 space-y-4'>
                <Skeleton.Title style={{ width: '60%' }} />
                <Skeleton.Paragraph rows={4} />
                <Skeleton.Button style={{ width: '100%', height: 48 }} />
              </div>
            </Card>
          ))}
        </div>
      ) : plans.length > 0 ? (
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 items-start'>
          {plans.map((p, index) => renderPlanCard(p, index))}
        </div>
      ) : (
        <div className='flex justify-center py-20'>
          <Empty
            title={t('暂无可用套餐')}
            description={t('管理员尚未配置订阅套餐')}
          />
        </div>
      )}

      <SubscriptionPurchaseModal
        t={t}
        visible={open}
        onCancel={closeBuy}
        selectedPlan={selectedPlan}
        paying={paying}
        selectedEpayMethod={selectedEpayMethod}
        setSelectedEpayMethod={setSelectedEpayMethod}
        epayMethods={epayMethods}
        enableOnlineTopUp={enableOnlineTopUp}
        enableStripeTopUp={enableStripeTopUp}
        enableCreemTopUp={enableCreemTopUp}
        purchaseLimitInfo={
          selectedPlan?.plan?.id
            ? {
                limit: Number(selectedPlan?.plan?.max_purchase_per_user || 0),
                count: getPlanPurchaseCount(selectedPlan?.plan?.id),
              }
            : null
        }
        onPayStripe={payStripe}
        onPayCreem={payCreem}
        onPayEpay={payEpay}
      />
    </div>
  );
};

export default SubscriptionPlansPage;
