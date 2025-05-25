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
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const user = await authenticateUser(req)
    const { fileId } = req.query

    if (!fileId) {
      return res.status(400).json({
        success: false,
        message: '文件ID是必需的'
      })
    }

    if (req.method === 'GET') {
      return await handleGetRecord(req, res, user, fileId)
    } else if (req.method === 'DELETE') {
      return await handleDeleteRecord(req, res, user, fileId)
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

// 获取特定文件的阅读记录
async function handleGetRecord(req, res, user, fileId) {
  const { data, error } = await supabase
    .from('reading_records')
    .select('*')
    .eq('user_id', user.id)
    .eq('file_id', fileId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') { // 记录不存在
      return res.status(404).json({
        success: false,
        message: '未找到阅读记录'
      })
    }
    
    console.error('获取记录失败:', error)
    return res.status(500).json({
      success: false,
      message: '获取记录失败'
    })
  }

  res.json({
    success: true,
    data: {
      record: {
        fileName: data.file_name,
        currentPage: data.current_page,
        totalPages: data.total_pages,
        readPages: data.read_pages,
        readingMode: data.reading_mode,
        lastModified: data.last_read,
        deviceId: data.device_id
      },
      lastSynced: data.updated_at
    }
  })
}

// 删除特定文件的阅读记录
async function handleDeleteRecord(req, res, user, fileId) {
  const { error } = await supabase
    .from('reading_records')
    .delete()
    .eq('user_id', user.id)
    .eq('file_id', fileId)

  if (error) {
    console.error('删除记录失败:', error)
    return res.status(500).json({
      success: false,
      message: '删除失败'
    })
  }

  res.json({
    success: true,
    message: '记录已删除'
  })
}
