import Audit from '../models/Audit.js'

export async function logAudit(req, type, action, meta = {}, overrideUser) {
  try {
    await Audit.create({
      type: type || 'general',
      action,
      userId: overrideUser?.id || req?.user?.id || '',
      userName: overrideUser?.name || overrideUser?.username || req?.user?.username || 'system',
      meta: meta || {},
    })
  } catch (e) {
    // swallow errors to avoid impacting main flow
  }
}
