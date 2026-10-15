import * as activityLogService from '../services/activityLogService.js';

export async function list(req, res, next) {
  try {
    const { module, action, user_id: userId } = req.query;
    const logs = await activityLogService.listActivityLogs({ module, action, userId });
    return res.status(200).json({ activity_logs: logs });
  } catch (error) {
    return next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const log = await activityLogService.getActivityLogById(req.params.id);
    return res.status(200).json({ activity_log: log });
  } catch (error) {
    return next(error);
  }
}
