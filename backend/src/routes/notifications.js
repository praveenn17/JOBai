const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET /api/notifications — list with unread count
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const items = db.prepare(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(req.user.id, limit);
    const unread = db.prepare(
      "SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0"
    ).get(req.user.id).c;
    res.json({ notifications: items, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notifications/read-all — mark all read
router.put('/read-all', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications — clear all
router.delete('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
    res.json({ message: 'All notifications cleared.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notifications/:id — delete single notification
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const changes = db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id).changes;
    if (!changes) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ message: 'Notification deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
