import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Modal,
  Form,
  Select,
  InputNumber,
  Input,
  Space,
  Typography,
  Toast,
  Popconfirm,
  Descriptions,
  Banner,
  Tabs,
  TabPane,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete, IconRefresh, IconSearch, IconSend } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, showInfo } from '../../helpers';

const { Text, Title } = Typography;

const QuotaCardPage = () => {
  const { t } = useTranslation();
  const [cards, setCards] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [stats, setStats] = useState({ total: 0, unused: 0, redeemed: 0, revoked: 0 });
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [codesModalVisible, setCodesModalVisible] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState([]);
  const [cardPage, setCardPage] = useState(1);
  const [cardTotal, setCardTotal] = useState(0);
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [userSearchKeyword, setUserSearchKeyword] = useState('');
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [userTokens, setUserTokens] = useState([]);
  const [tokensLoading, setTokensLoading] = useState(false);
  const pageSize = 10;

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/quota-card/?p=${cardPage}&page_size=${pageSize}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (searchKeyword) url += `&keyword=${encodeURIComponent(searchKeyword)}`;
      const res = await API.get(url);
      if (res.data.success) {
        setCards(res.data.data.items || []);
        setCardTotal(res.data.data.total || 0);
      }
    } catch (e) {
      showError(e.message);
    }
    setLoading(false);
  }, [cardPage, statusFilter, searchKeyword]);

  const loadStats = useCallback(async () => {
    try {
      const res = await API.get('/api/quota-card/stats');
      if (res.data.success) {
        setStats(res.data.data);
      }
    } catch (e) { /* ignore */ }
  }, []);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await API.get(`/api/quota-card/redemptions?p=${recordPage}&page_size=${pageSize}`);
      if (res.data.success) {
        setRecords(res.data.data.items || []);
        setRecordTotal(res.data.data.total || 0);
      }
    } catch (e) {
      showError(e.message);
    }
    setRecordsLoading(false);
  }, [recordPage]);

  useEffect(() => { loadCards(); }, [loadCards]);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const handleCreate = async (values) => {
    try {
      const res = await API.post('/api/quota-card/', values);
      if (res.data.success) {
        setGeneratedCodes(res.data.data || []);
        setCodesModalVisible(true);
        setCreateModalVisible(false);
        showSuccess(`成功创建 ${res.data.data.length} 张额度卡`);
        loadCards();
        loadStats();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await API.delete(`/api/quota-card/${id}`);
      if (res.data.success) {
        showSuccess('删除成功');
        loadCards();
        loadStats();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const handleRevoke = async (recordId) => {
    try {
      const res = await API.post(`/api/quota-card/${recordId}/revoke`, { reason: '管理员撤销' });
      if (res.data.success) {
        showSuccess('撤销成功');
        loadCards();
        loadRecords();
        loadStats();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
  };

  const copyAllCodes = () => {
    const text = generatedCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => showSuccess('已复制到剪贴板'));
  };

  const searchUsers = useCallback(async (keyword) => {
    if (!keyword || keyword.length < 1) return;
    setUserSearching(true);
    try {
      const res = await API.get(`/api/user/search?keyword=${encodeURIComponent(keyword)}`);
      if (res.data.success) {
        const users = (res.data.data?.items || res.data.data || []).map((u) => ({
          value: u.id,
          label: `${u.username} (ID: ${u.id})`,
          username: u.username,
        }));
        setUserSearchResults(users);
      }
    } catch (e) { /* ignore */ }
    setUserSearching(false);
  }, []);

  const loadUserTokens = useCallback(async (userId) => {
    if (!userId) return;
    setTokensLoading(true);
    try {
      const res = await API.get(`/api/quota-card/user-tokens/${userId}`);
      if (res.data.success) {
        setUserTokens(res.data.data.tokens || []);
        setSelectedUsername(res.data.data.username || '');
      }
    } catch (e) {
      showError('获取用户令牌失败');
    }
    setTokensLoading(false);
  }, []);

  const handleAssign = async (values) => {
    if (!selectedUserId) {
      showError('请选择用户');
      return;
    }
    if (!values.token_id) {
      showError('请选择令牌');
      return;
    }
    setAssignLoading(true);
    try {
      const payload = {
        user_id: selectedUserId,
        token_id: values.token_id,
        card_type: values.card_type || 'quota',
        quota_amount: values.quota_amount || 0,
        time_amount: values.time_amount || 0,
        time_unit: values.time_unit || 'days',
        name: values.name || '管理员分配',
      };
      const res = await API.post('/api/quota-card/assign', payload);
      if (res.data.success) {
        const d = res.data.data;
        showSuccess(`分配成功：用户 ${d.username}，令牌 ${d.token_name}，额度 +$${(d.quota_added / 500000).toFixed(2)}`);
        setAssignModalVisible(false);
        setSelectedUserId(null);
        setSelectedUsername('');
        setUserTokens([]);
        loadCards();
        loadRecords();
        loadStats();
      } else {
        showError(res.data.message);
      }
    } catch (e) {
      showError(e.message);
    }
    setAssignLoading(false);
  };

  const statusTagMap = {
    1: <Tag color='green'>{t('未使用')}</Tag>,
    2: <Tag color='blue'>{t('已兑换')}</Tag>,
    3: <Tag color='red'>{t('已撤销')}</Tag>,
  };

  const cardTypeMap = {
    quota: t('额度卡'),
    time: t('时间卡'),
    combo: t('组合卡'),
  };

  const formatQuota = (quota) => {
    return `$${(quota / 500000).toFixed(2)}`;
  };

  const formatTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts * 1000).toLocaleString();
  };

  const cardColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('卡密'), dataIndex: 'code', width: 200, render: (text) => <Text copyable>{text}</Text> },
    { title: t('名称'), dataIndex: 'name', width: 120 },
    { title: t('类型'), dataIndex: 'card_type', width: 80, render: (v) => cardTypeMap[v] || v },
    { title: t('额度'), dataIndex: 'quota_amount', width: 100, render: (v) => v > 0 ? formatQuota(v) : '-' },
    { title: t('时间'), dataIndex: 'time_amount', width: 100, render: (v, r) => v > 0 ? `${v} ${r.time_unit === 'hours' ? t('小时') : t('天')}` : '-' },
    { title: t('状态'), dataIndex: 'status', width: 80, render: (v) => statusTagMap[v] },
    { title: t('过期时间'), dataIndex: 'expired_time', width: 160, render: formatTime },
    { title: t('创建时间'), dataIndex: 'created_time', width: 160, render: formatTime },
    {
      title: t('操作'), width: 80, render: (_, record) => (
        record.status === 1 ? (
          <Popconfirm title={t('确定删除？')} onConfirm={() => handleDelete(record.id)}>
            <Button icon={<IconDelete />} type='danger' theme='light' size='small' />
          </Popconfirm>
        ) : null
      ),
    },
  ];

  const recordColumns = [
    { title: 'ID', dataIndex: 'id', width: 60 },
    { title: t('卡密'), dataIndex: 'card_code', width: 200 },
    { title: t('用户'), dataIndex: 'username', width: 100 },
    { title: t('令牌'), dataIndex: 'token_name', width: 100 },
    { title: t('类型'), dataIndex: 'card_type', width: 80, render: (v) => cardTypeMap[v] || v },
    { title: t('额度变动'), width: 120, render: (_, r) => r.quota_added > 0 ? `+${formatQuota(r.quota_added)}` : '-' },
    { title: t('时间变动'), width: 100, render: (_, r) => r.time_added > 0 ? `+${r.time_added} 天` : '-' },
    { title: t('已撤销'), dataIndex: 'revoked', width: 80, render: (v) => v ? <Tag color='red'>{t('是')}</Tag> : <Tag color='green'>{t('否')}</Tag> },
    { title: t('兑换时间'), dataIndex: 'created_time', width: 160, render: formatTime },
    {
      title: t('操作'), width: 80, render: (_, record) => (
        !record.revoked ? (
          <Popconfirm title={t('确定撤销？撤销后将扣回额度')} onConfirm={() => handleRevoke(record.id)}>
            <Button type='warning' theme='light' size='small'>{t('撤销')}</Button>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  return (
    <div className='mt-[60px] px-2'>
      <div className='grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4'>
        <Card bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <div className='text-2xl font-bold'>{stats.total}</div>
          <Text type='tertiary'>{t('总数')}</Text>
        </Card>
        <Card bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <div className='text-2xl font-bold text-green-600'>{stats.unused}</div>
          <Text type='tertiary'>{t('未使用')}</Text>
        </Card>
        <Card bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <div className='text-2xl font-bold text-blue-600'>{stats.redeemed}</div>
          <Text type='tertiary'>{t('已兑换')}</Text>
        </Card>
        <Card bodyStyle={{ padding: '16px', textAlign: 'center' }}>
          <div className='text-2xl font-bold text-red-600'>{stats.revoked}</div>
          <Text type='tertiary'>{t('已撤销')}</Text>
        </Card>
      </div>

      <Card>
        <Tabs type='line'>
          <TabPane tab={t('额度卡列表')} itemKey='cards'>
            <div className='flex flex-wrap items-center gap-2 mb-4'>
              <Button icon={<IconPlus />} theme='solid' onClick={() => setCreateModalVisible(true)}>
                {t('创建额度卡')}
              </Button>
              <Button icon={<IconSend />} theme='solid' type='secondary' onClick={() => setAssignModalVisible(true)}>
                {t('分配订阅')}
              </Button>
              <Select
                placeholder={t('状态筛选')}
                value={statusFilter}
                onChange={(v) => { setStatusFilter(v); setCardPage(1); }}
                style={{ width: 120 }}
              >
                <Select.Option value={0}>{t('全部')}</Select.Option>
                <Select.Option value={1}>{t('未使用')}</Select.Option>
                <Select.Option value={2}>{t('已兑换')}</Select.Option>
                <Select.Option value={3}>{t('已撤销')}</Select.Option>
              </Select>
              <Input
                prefix={<IconSearch />}
                placeholder={t('搜索卡密/名称')}
                value={searchKeyword}
                onChange={(v) => setSearchKeyword(v)}
                onEnterPress={() => { setCardPage(1); loadCards(); }}
                style={{ width: 200 }}
                showClear
              />
              <Button icon={<IconRefresh />} onClick={() => { loadCards(); loadStats(); }}>
                {t('刷新')}
              </Button>
            </div>
            <Table
              columns={cardColumns}
              dataSource={cards}
              loading={loading}
              pagination={{
                currentPage: cardPage,
                pageSize,
                total: cardTotal,
                onPageChange: setCardPage,
              }}
              rowKey='id'
              size='small'
            />
          </TabPane>
          <TabPane tab={t('兑换记录')} itemKey='records'>
            <Table
              columns={recordColumns}
              dataSource={records}
              loading={recordsLoading}
              pagination={{
                currentPage: recordPage,
                pageSize,
                total: recordTotal,
                onPageChange: setRecordPage,
              }}
              rowKey='id'
              size='small'
            />
          </TabPane>
        </Tabs>
      </Card>

      <Modal
        title={t('创建额度卡')}
        visible={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        footer={null}
        width={480}
      >
        <Form onSubmit={handleCreate}>
          <Form.Input field='name' label={t('名称')} rules={[{ required: true, message: t('请输入名称') }]} />
          <Form.Select field='card_type' label={t('卡类型')} initValue='quota' style={{ width: '100%' }}>
            <Select.Option value='quota'>{t('额度卡')}</Select.Option>
            <Select.Option value='time'>{t('时间卡')}</Select.Option>
            <Select.Option value='combo'>{t('组合卡')}</Select.Option>
          </Form.Select>
          <Form.InputNumber field='quota_amount' label={t('额度（内部单位，500000=1$）')} initValue={500000} min={0} style={{ width: '100%' }} />
          <Form.InputNumber field='time_amount' label={t('时间数量')} initValue={0} min={0} style={{ width: '100%' }} />
          <Form.Select field='time_unit' label={t('时间单位')} initValue='days' style={{ width: '100%' }}>
            <Select.Option value='days'>{t('天')}</Select.Option>
            <Select.Option value='hours'>{t('小时')}</Select.Option>
          </Form.Select>
          <Form.InputNumber field='count' label={t('生成数量')} initValue={1} min={1} max={100} style={{ width: '100%' }} />
          <div className='flex justify-end mt-4'>
            <Space>
              <Button onClick={() => setCreateModalVisible(false)}>{t('取消')}</Button>
              <Button htmlType='submit' theme='solid'>{t('创建')}</Button>
            </Space>
          </div>
        </Form>
      </Modal>

      <Modal
        title={t('生成的卡密')}
        visible={codesModalVisible}
        onCancel={() => setCodesModalVisible(false)}
        footer={
          <Button theme='solid' onClick={copyAllCodes}>{t('复制全部')}</Button>
        }
        width={480}
      >
        <Banner type='success' description={`成功生成 ${generatedCodes.length} 张额度卡`} className='mb-3' />
        <div className='bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-60 overflow-y-auto'>
          {generatedCodes.map((code, i) => (
            <div key={i} className='py-1'>
              <Text copyable>{code}</Text>
            </div>
          ))}
        </div>
      </Modal>

      <Modal
        title={t('分配订阅')}
        visible={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false);
          setSelectedUserId(null);
          setSelectedUsername('');
          setUserTokens([]);
          setUserSearchResults([]);
        }}
        footer={null}
        width={520}
      >
        <Form onSubmit={handleAssign}>
          <Form.Slot label={t('选择用户')}>
            <Select
              filter
              remote
              onSearch={(v) => { setUserSearchKeyword(v); searchUsers(v); }}
              optionList={userSearchResults}
              loading={userSearching}
              placeholder={t('输入用户名搜索')}
              style={{ width: '100%' }}
              onChange={(v) => {
                setSelectedUserId(v);
                const found = userSearchResults.find((u) => u.value === v);
                if (found) setSelectedUsername(found.username);
                loadUserTokens(v);
              }}
              showClear
            />
          </Form.Slot>
          {selectedUserId && (
            <Form.Select
              field='token_id'
              label={t('选择令牌')}
              placeholder={tokensLoading ? t('加载中...') : t('选择目标令牌')}
              style={{ width: '100%' }}
              rules={[{ required: true, message: t('请选择令牌') }]}
              loading={tokensLoading}
            >
              {userTokens.map((tk) => (
                <Select.Option key={tk.id} value={tk.id}>
                  {tk.name} (余额: ${(tk.remain_quota / 500000).toFixed(2)}, 已用: ${(tk.used_quota / 500000).toFixed(2)})
                </Select.Option>
              ))}
            </Form.Select>
          )}
          <Form.Input field='name' label={t('备注名称')} initValue='管理员分配' />
          <Form.Select field='card_type' label={t('分配类型')} initValue='quota' style={{ width: '100%' }}>
            <Select.Option value='quota'>{t('额度')}</Select.Option>
            <Select.Option value='time'>{t('时间')}</Select.Option>
            <Select.Option value='combo'>{t('额度+时间')}</Select.Option>
          </Form.Select>
          <Form.InputNumber field='quota_amount' label={t('额度（内部单位，500000=1$）')} initValue={500000} min={0} style={{ width: '100%' }} />
          <Form.InputNumber field='time_amount' label={t('时间数量')} initValue={0} min={0} style={{ width: '100%' }} />
          <Form.Select field='time_unit' label={t('时间单位')} initValue='days' style={{ width: '100%' }}>
            <Select.Option value='days'>{t('天')}</Select.Option>
            <Select.Option value='hours'>{t('小时')}</Select.Option>
          </Form.Select>
          <div className='flex justify-end mt-4'>
            <Space>
              <Button onClick={() => { setAssignModalVisible(false); setSelectedUserId(null); setUserTokens([]); }}>{t('取消')}</Button>
              <Button htmlType='submit' theme='solid' loading={assignLoading} disabled={!selectedUserId}>{t('确认分配')}</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default QuotaCardPage;
