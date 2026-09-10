import React, { useEffect, useState, useRef } from 'react';
import { Bell, CheckCheck, Trash2, Zap, Mail, Info } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';

const TYPE_META = {
  queue_application: { icon: Zap,  color: '#2563eb' },
  queue_email:       { icon: Mail, color: '#7c3aed' },
  outcome_reminder:  { icon: Mail, color: '#f59e0b' },
  info:              { icon: Info, color: '#64748b' },
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen]         = useState(false);
  const [notifications, setNotifs] = useState([]);
  const [unread, setUnread]     = useState(0);
  const dropdownRef             = useRef(null);

  const load = async () => {
    try {
      const r = await api.get(ENDPOINTS.notifications.list, { params: { limit: 20 } });
      setNotifs(r.data.notifications || []);
      setUnread(r.data.unread || 0);
    } catch {}
  };

  // Poll every 30 s for queue notifications
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await api.put(ENDPOINTS.notifications.markAll);
      setNotifs(ns => ns.map(n => ({ ...n, read: 1 })));
      setUnread(0);
    } catch {}
  };

  const clearAll = async () => {
    try {
      await api.delete(ENDPOINTS.notifications.clear);
      setNotifs([]);
      setUnread(0);
    } catch {}
  };

  const markOne = async (id) => {
    try {
      await api.put(buildUrl(ENDPOINTS.notifications.markRead, { id }));
      setNotifs(ns => ns.map(n => n.id === id ? { ...n, read: 1 } : n));
      setUnread(u => Math.max(0, u - 1));
    } catch {}
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={() => { setOpen(o => !o); }}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: 6, borderRadius: 8, color: '#64748b',
          display: 'flex', alignItems: 'center', transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
        onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
        title="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 99,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700, fontFamily: 'Space Mono,monospace',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)',
          width: 340, background: '#0d1117', border: '1px solid #1a2236',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          zIndex: 999, overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderBottom: '1px solid #1a2236',
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', fontFamily: 'Syne,sans-serif' }}>
              Notifications{unread > 0 && <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 6 }}>({unread} new)</span>}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {unread > 0 && (
                <button onClick={markAllRead} title="Mark all read"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', padding: 4 }}>
                  <CheckCheck size={15} />
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} title="Clear all"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', display: 'flex', padding: 4 }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#334155', fontSize: 13 }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => {
                const { icon: Icon, color } = TYPE_META[n.type] || TYPE_META.info;
                return (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markOne(n.id)}
                    style={{
                      display: 'flex', gap: 12, padding: '12px 16px',
                      borderBottom: '1px solid #111827',
                      cursor: n.read ? 'default' : 'pointer',
                      background: n.read ? 'transparent' : 'rgba(37,99,235,0.04)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => !n.read && (e.currentTarget.style.background = 'rgba(37,99,235,0.08)')}
                    onMouseLeave={e => !n.read && (e.currentTarget.style.background = 'rgba(37,99,235,0.04)')}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={15} color={color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 13, fontWeight: n.read ? 500 : 700,
                        color: n.read ? '#64748b' : '#e2e8f0', marginBottom: 2,
                      }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{n.message}</div>
                      <div style={{ fontSize: 11, color: '#334155', marginTop: 4, fontFamily: 'Space Mono,monospace' }}>
                        {timeAgo(n.created_at)}
                      </div>
                    </div>
                    {!n.read && (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: 6 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
