import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

// 验证JWT令牌
async function authenticateUser(req) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('缺少访问令牌')
  }

  const token = authHeader.split(' ')[1]
  const { data: { user }, error } = await supabase.auth.getUser(token)
  
  if (error || !user) {
    throw new Error('令牌无效')
  }

  return user
}

export default async function handler(req, res) {
  // 设置CORS头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const user = await authenticateUser(req)

    if (req.method === 'POST') {
      return await handleCreateOrUpdate(req, res, user)
    } else if (req.method === 'GET') {
      return await handleGetAllRecords(req, res, user)
    } else {
      return res.status(405).json({
        success: false,
        message: '不支持的请求方法'
      })
    }
  } catch (error) {
    console.error('API错误:', error)
    
    if (error.message.includes('令牌') || error.message.includes('访问')) {
      return res.status(401).json({
        success: false,
        message: error.message
      })
    }

    return res.status(500).json({
      success: false,
      message: '服务器错误'
    })
  }
}

// 创建或更新阅读记录
async function handleCreateOrUpdate(req, res, user) {
  const { fileId, record } = req.body

  if (!fileId || !record) {
    return res.status(400).json({
      success: false,
      message: '文件ID和记录数据都是必填项'
    })
  }

  const recordData = {
    user_id: user.id,
    file_id: fileId,
    file_name: record.fileName || '',
    current_page: record.currentPage || 1,
    total_pages: record.totalPages || 0,
    read_pages: record.readPages || [],
    reading_mode: record.readingMode || false,
    device_id: record.deviceId || '',
    last_read: record.lastModified ? new Date(record.lastModified) : new Date()
  }

  // 使用 upsert 实现创建或更新
  const { data, error } = await supabase
    .from('reading_records')
    .upsert(recordData, {
      onConflict: 'user_id,file_id',
      returning: 'minimal'
    })

  if (error) {
    console.error('保存记录失败:', error)
    return res.status(500).json({
      success: false,
      message: '保存失败'
    })
  }

  res.json({
    success: true,
    message: '同步成功',
    data: {
      lastSynced: new Date().toISOString()
    }
  })
}

// 获取所有阅读记录
async function handleGetAllRecords(req, res, user) {
  const { limit = 50, offset = 0, sort = 'last_read', order = 'desc' } = req.query

  const { data, error, count } = await supabase
    .from('reading_records')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order(sort, { ascending: order === 'asc' })
    .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

  if (error) {
    console.error('获取记录失败:', error)
    return res.status(500).json({
      success: false,
      message: '获取记录失败'
    })
  }

  const records = data.map(record => ({
    fileId: record.file_id,
    fileName: record.file_name,
    currentPage: record.current_page,
    totalPages: record.total_pages,
    readProgress: record.total_pages > 0 ? record.read_pages.length / record.total_pages : 0,
    lastRead: record.last_read
  }))

  res.json({
    success: true,
    data: {
      records,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    }
  })
}
