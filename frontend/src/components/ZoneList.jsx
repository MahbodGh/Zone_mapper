import { useI18n } from '../context/I18nContext.jsx'

export default function ZoneList({
  zones, total, selected, showUserColumn,
  query, setQuery,
  regionFilter, setRegionFilter, regions,
  userFilter, setUserFilter, usersList,
  onToggle, onSelectShown, onClearSelection,
  onEdit, onDelete, onFocus,
}) {
  const { t } = useI18n()
  const shownIds = zones.map((z) => z.id)
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id))

  return (
    <div className="list-wrap">
      <div className="filters">
        <input className="search" placeholder={t('searchPlaceholder')}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="filter-row">
          <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
            <option value="">{t('allRegions')}</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {showUserColumn && (
            <select value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="">{t('allUsers')}</option>
              {usersList.map((u) => <option key={u} value={u}>@{u}</option>)}
            </select>
          )}
        </div>
        <div className="filter-actions">
          <span className="count">
            {zones.length === total ? `${total} ${t('zoneCount')}` : `${zones.length} / ${total}`}
            {selected.size > 0 && ` · ${selected.size} ${t('selected')}`}
          </span>
          <button className="link-btn" onClick={onSelectShown}>
            {allShownSelected ? t('deselectThese') : t('selectResults')}
          </button>
          {selected.size > 0 && <button className="link-btn" onClick={onClearSelection}>{t('clearSelection')}</button>}
        </div>
      </div>

      <div className="zone-list">
        {total === 0 && <div className="empty">{t('noZones')}<br />{t('drawHint')}</div>}
        {total > 0 && zones.length === 0 && <div className="empty">{t('noResults')}</div>}
        {zones.map((z) => (
          <div key={z.id} className="zone-row">
            <input type="checkbox" checked={selected.has(z.id)} onChange={() => onToggle(z.id)} />
            <button className="chip" style={{ background: z.color }} onClick={() => onFocus(z)} />
            <div className="zone-info" onClick={() => onFocus(z)}>
              <strong>{z.name}</strong>
              <small>
                {z.region || t('noRegion')}
                {showUserColumn && z.owner_username && ` · @${z.owner_username}`}
              </small>
            </div>
            <button className="icon-btn" onClick={() => onEdit(z)} title={t('edit')}>✎</button>
            <button className="icon-btn danger" onClick={() => onDelete(z)} title={t('delete')}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}
