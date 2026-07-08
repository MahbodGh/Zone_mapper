import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '../context/I18nContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../api.js'

function buildTree(users, rootParentId) {
  // group by parent_id, then walk from the current user's children
  const byParent = new Map()
  users.forEach((u) => {
    const p = u.parent_id
    if (!byParent.has(p)) byParent.set(p, [])
    byParent.get(p).push(u)
  })
  const attach = (list) =>
    (list || []).map((u) => ({ ...u, children: attach(byParent.get(u.id)) }))
  // roots = users whose parent is the viewer (or, for superadmin, top-level)
  return { byParent, attach }
}

export default function UsersPanel({ notify }) {
  const { t } = useI18n()
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = () => api.listUsers().then(setUsers).catch((e) => notify(e.message))
  useEffect(() => { load() }, [])

  const tree = useMemo(() => {
    const { byParent } = buildTree(users)
    // for a normal user, roots are their direct children; for superadmin, everyone with no parent
    const rootParent = me?.role === 'superadmin' ? null : me?.id
    const build = (parentId) =>
      (byParent.get(parentId) || [])
        .filter((u) => u.id !== me?.id)
        .map((u) => ({ ...u, children: build(u.id) }))
    return build(rootParent)
  }, [users, me])

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active })
      notify(u.is_active ? t('deactivate') + ' ✓' : t('activate') + ' ✓')
      load()
    } catch (e) { notify(e.message) }
  }

  const remove = async (u) => {
    if (!window.confirm(t('deleteUserConfirm'))) return
    try {
      await api.deleteUser(u.id)
      load()
    } catch (e) { notify(e.message) }
  }

  return (
    <div className="users-panel">
      <div className="users-head">
        <h2>{t('usersTitle')}</h2>
        <button className="btn primary sm" onClick={() => setShowForm(true)}>+ {t('newSubUser')}</button>
      </div>

      {/* current account card */}
      {me && (
        <div className="me-card">
          <span className="me-badge">{t('you')}</span>
          <strong>{me.first_name} {me.last_name} ({me.username})</strong>
          <small>{me.role === 'superadmin' ? t('superadmin') : t('user')}</small>
        </div>
      )}

      <div className="tree">
        {tree.length === 0 && <div className="empty">—</div>}
        {tree.map((u) => (
          <UserNode key={u.id} node={u} depth={0} t={t}
            onToggle={toggleActive} onDelete={remove} />
        ))}
      </div>

      {showForm && (
        <SubUserForm t={t} busy={busy} setBusy={setBusy}
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); notify(t('userCreated')) }}
          notify={notify} />
      )}
    </div>
  )
}

function UserNode({ node, depth, t, onToggle, onDelete }) {
  return (
    <>
      <div className="tree-row" style={{ paddingInlineStart: 8 + depth * 20 }}>
        <span className="tree-branch">{depth > 0 ? '└' : '•'}</span>
        <div className="tree-info">
          <strong className={node.is_active ? '' : 'muted'}>
            {node.first_name} {node.last_name}
            <span className="uname">@{node.username}</span>
          </strong>
          <small>
            {node.zone_count} {t('zonesCount')} · {node.children_count} {t('subUsers')}
            {node.zone_quota > 0 && ` · ${t('zoneQuota').split(' ')[0]}: ${node.zone_quota}`}
          </small>
        </div>
        <button className={`badge ${node.is_active ? 'ok' : 'off'}`} onClick={() => onToggle(node)}>
          {node.is_active ? t('active') : t('inactive')}
        </button>
        <button className="icon-btn danger" onClick={() => onDelete(node)} title={t('delete')}>✕</button>
      </div>
      {node.children?.map((c) => (
        <UserNode key={c.id} node={c} depth={depth + 1} t={t} onToggle={onToggle} onDelete={onDelete} />
      ))}
    </>
  )
}

function SubUserForm({ t, onClose, onCreated, notify, busy, setBusy }) {
  const [f, setF] = useState({ username: '', password: '', email: '', first_name: '', last_name: '', zone_quota: 0 })
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async () => {
    if (f.username.trim().length < 3 || f.password.length < 6) {
      notify(t('nameRequired')); return
    }
    setBusy(true)
    try {
      await api.createUser({
        username: f.username.trim(), password: f.password,
        email: f.email.trim() || undefined,
        first_name: f.first_name.trim(), last_name: f.last_name.trim(),
        zone_quota: Number(f.zone_quota) || 0,
      })
      onCreated()
    } catch (e) { notify(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('addSubUser')}</h2>
        <div className="auth-row">
          <label>{t('firstName')}<input value={f.first_name} onChange={up('first_name')} /></label>
          <label>{t('lastName')}<input value={f.last_name} onChange={up('last_name')} /></label>
        </div>
        <label>{t('username')} <span className="req">*</span>
          <input value={f.username} onChange={up('username')} autoFocus />
        </label>
        <label>{t('password')} <span className="req">*</span>
          <input type="password" value={f.password} onChange={up('password')} />
        </label>
        <label>{t('email')} <small>({t('optional')})</small>
          <input type="email" value={f.email} onChange={up('email')} />
        </label>
        <label>{t('zoneQuota')}
          <input type="number" min="0" value={f.zone_quota} onChange={up('zone_quota')} />
        </label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{t('cancel')}</button>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {busy ? t('saving') : t('createUser')}
          </button>
        </div>
      </div>
    </div>
  )
}
