package session

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Store 会话存储
type Store struct {
	db *sql.DB
}

// NewStore 创建存储实例
func NewStore(dbPath string) (*Store, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	store := &Store{db: db}
	if err := store.initTables(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to init tables: %w", err)
	}

	return store, nil
}

// initTables 初始化数据库表
func (s *Store) initTables() error {
	// 会话表
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			group_path TEXT DEFAULT '',
			description TEXT DEFAULT '',
			protocol TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			user TEXT NOT NULL,
			auth_type TEXT NOT NULL,
			password TEXT DEFAULT '',
			key_path TEXT DEFAULT '',
			key_passphrase TEXT DEFAULT '',
			keep_alive INTEGER DEFAULT 30,
			proxy_jump TEXT DEFAULT '',
			proxy_command TEXT DEFAULT '',
			terminal_type TEXT DEFAULT 'xterm-256color',
			font_size INTEGER DEFAULT 14,
			font_family TEXT DEFAULT '',
			theme_id TEXT DEFAULT '',
			encoding TEXT DEFAULT 'UTF-8',
			login_script TEXT DEFAULT '',
			tags TEXT DEFAULT '',
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			last_used_at TEXT
		)
	`)
	if err != nil {
		return err
	}

	// 分组表
	_, err = s.db.Exec(`
		CREATE TABLE IF NOT EXISTS groups (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT DEFAULT '',
			path TEXT NOT NULL,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	// 创建索引
	_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_sessions_group ON sessions(group_path)`)
	if err != nil {
		return err
	}

	_, err = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_groups_parent ON groups(parent_id)`)
	if err != nil {
		return err
	}

	// 添加 Serial 协议专用列（如果不存在）
	s.addColumnIfNotExists("sessions", "data_bits", "INTEGER DEFAULT 8")
	s.addColumnIfNotExists("sessions", "stop_bits", "INTEGER DEFAULT 1")
	s.addColumnIfNotExists("sessions", "parity", "TEXT DEFAULT 'none'")

	// 添加 Local 协议专用列（如果不存在）
	s.addColumnIfNotExists("sessions", "local_env", "TEXT DEFAULT '[]'")

	return nil
}

// addColumnIfNotExists 添加列（如果不存在）
func (s *Store) addColumnIfNotExists(table, column, definition string) {
	// 检查列是否存在
	row := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?`, table, column)
	var count int
	if row.Scan(&count) == nil && count > 0 {
		return
	}
	// 添加列
	s.db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, column, definition))
}

// Close 关闭数据库
func (s *Store) Close() error {
	return s.db.Close()
}

// CreateSession 创建会话
func (s *Store) CreateSession(session *Session) error {
	// 如果没有 ID，生成一个
	if session.ID == "" {
		session.ID = generateSessionID()
	}

	// 设置默认值
	if session.Protocol == "" {
		session.Protocol = ProtocolSSH
	}
	if session.Port == 0 {
		session.Port = defaultPort(session.Protocol)
	}
	if session.TerminalType == "" {
		session.TerminalType = "xterm-256color"
	}
	if session.FontSize == 0 {
		session.FontSize = 14
	}
	if session.Encoding == "" {
		session.Encoding = "UTF-8"
	}
	if session.KeepAlive == 0 {
		session.KeepAlive = 30
	}

	// 设置时间
	now := FlexibleTime{Time: time.Now()}
	if session.CreatedAt.IsZero() {
		session.CreatedAt = now
	}
	if session.UpdatedAt.IsZero() {
		session.UpdatedAt = now
	}

	loginScriptJSON, _ := json.Marshal(session.LoginScript)
	tagsJSON, _ := json.Marshal(session.Tags)
	localEnvJSON, _ := json.Marshal(session.LocalEnv)

	createdAtStr := ""
	if !session.CreatedAt.IsZero() {
		createdAtStr = session.CreatedAt.Time.Format(time.RFC3339)
	}
	updatedAtStr := ""
	if !session.UpdatedAt.IsZero() {
		updatedAtStr = session.UpdatedAt.Time.Format(time.RFC3339)
	}

	_, err := s.db.Exec(`
		INSERT INTO sessions (
			id, name, group_path, description, protocol, host, port, user,
			auth_type, password, key_path, key_passphrase, keep_alive,
			proxy_jump, proxy_command, terminal_type, font_size, font_family,
			theme_id, encoding, login_script, tags, created_at, updated_at, last_used_at, local_env
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		session.ID, session.Name, session.Group, session.Description,
		string(session.Protocol), session.Host, session.Port, session.User,
		string(session.AuthType), session.Password, session.KeyPath, session.KeyPassphrase,
		session.KeepAlive, session.ProxyJump, session.ProxyCommand,
		session.TerminalType, session.FontSize, session.FontFamily,
		session.ThemeID, session.Encoding, string(loginScriptJSON), string(tagsJSON),
		createdAtStr, updatedAtStr, "", string(localEnvJSON),
	)
	return err
}

// GetSession 获取会话
func (s *Store) GetSession(id string) (*Session, error) {
	row := s.db.QueryRow(`
		SELECT id, name, group_path, description, protocol, host, port, user,
			auth_type, password, key_path, key_passphrase, keep_alive,
			proxy_jump, proxy_command, terminal_type, font_size, font_family,
			theme_id, encoding, login_script, tags, created_at, updated_at, last_used_at, local_env
		FROM sessions WHERE id = ?
	`, id)

	session := &Session{}
	var loginScriptJSON, tagsJSON, localEnvJSON string
	var createdAt, updatedAt, lastUsedAt sql.NullString

	err := row.Scan(
		&session.ID, &session.Name, &session.Group, &session.Description,
		&session.Protocol, &session.Host, &session.Port, &session.User,
		&session.AuthType, &session.Password, &session.KeyPath, &session.KeyPassphrase,
		&session.KeepAlive, &session.ProxyJump, &session.ProxyCommand,
		&session.TerminalType, &session.FontSize, &session.FontFamily,
		&session.ThemeID, &session.Encoding, &loginScriptJSON, &tagsJSON,
		&createdAt, &updatedAt, &lastUsedAt, &localEnvJSON,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("session not found")
		}
		return nil, err
	}

	if createdAt.Valid {
		t, _ := time.Parse(time.RFC3339, createdAt.String)
		session.CreatedAt = FlexibleTime{Time: t}
	}
	if updatedAt.Valid {
		t, _ := time.Parse(time.RFC3339, updatedAt.String)
		session.UpdatedAt = FlexibleTime{Time: t}
	}
	if lastUsedAt.Valid && lastUsedAt.String != "" {
		t, _ := time.Parse(time.RFC3339, lastUsedAt.String)
		session.LastUsedAt = FlexibleTime{Time: t}
	}

	json.Unmarshal([]byte(loginScriptJSON), &session.LoginScript)
	json.Unmarshal([]byte(tagsJSON), &session.Tags)
	json.Unmarshal([]byte(localEnvJSON), &session.LocalEnv)

	return session, nil
}

// ListSessions 列出所有会话
func (s *Store) ListSessions() ([]*Session, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, protocol, host, port, user,
			auth_type, password, key_path, key_passphrase, keep_alive,
			proxy_jump, proxy_command, terminal_type, font_size, font_family,
			theme_id, encoding, login_script, tags, created_at, updated_at, last_used_at, local_env
		FROM sessions ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanSessions(rows)
}

// ListSessionsByGroup 按分组列出会话
func (s *Store) ListSessionsByGroup(group string) ([]*Session, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, protocol, host, port, user,
			auth_type, password, key_path, key_passphrase, keep_alive,
			proxy_jump, proxy_command, terminal_type, font_size, font_family,
			theme_id, encoding, login_script, tags, created_at, updated_at, last_used_at, local_env
		FROM sessions WHERE group_path = ? ORDER BY name
	`, group)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanSessions(rows)
}

// SearchSessions 搜索会话
func (s *Store) SearchSessions(keyword string) ([]*Session, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, protocol, host, port, user,
			auth_type, password, key_path, key_passphrase, keep_alive,
			proxy_jump, proxy_command, terminal_type, font_size, font_family,
			theme_id, encoding, login_script, tags, created_at, updated_at, last_used_at, local_env
		FROM sessions WHERE name LIKE ? OR host LIKE ? OR description LIKE ?
		ORDER BY name
	`,
		"%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanSessions(rows)
}

// scanSessions 扫描会话列表
func (s *Store) scanSessions(rows *sql.Rows) ([]*Session, error) {
	var sessions []*Session
	for rows.Next() {
		session := &Session{}
		var loginScriptJSON, tagsJSON, localEnvJSON string
		var createdAt, updatedAt, lastUsedAt sql.NullString

		err := rows.Scan(
			&session.ID, &session.Name, &session.Group, &session.Description,
			&session.Protocol, &session.Host, &session.Port, &session.User,
			&session.AuthType, &session.Password, &session.KeyPath, &session.KeyPassphrase,
			&session.KeepAlive, &session.ProxyJump, &session.ProxyCommand,
			&session.TerminalType, &session.FontSize, &session.FontFamily,
			&session.ThemeID, &session.Encoding, &loginScriptJSON, &tagsJSON,
			&createdAt, &updatedAt, &lastUsedAt, &localEnvJSON,
		)
		if err != nil {
			return nil, err
		}

		if createdAt.Valid {
			t, _ := time.Parse(time.RFC3339, createdAt.String)
			session.CreatedAt = FlexibleTime{Time: t}
		}
		if updatedAt.Valid {
			t, _ := time.Parse(time.RFC3339, updatedAt.String)
			session.UpdatedAt = FlexibleTime{Time: t}
		}
		if lastUsedAt.Valid && lastUsedAt.String != "" {
			t, _ := time.Parse(time.RFC3339, lastUsedAt.String)
			session.LastUsedAt = FlexibleTime{Time: t}
		}

		json.Unmarshal([]byte(loginScriptJSON), &session.LoginScript)
		json.Unmarshal([]byte(tagsJSON), &session.Tags)
		json.Unmarshal([]byte(localEnvJSON), &session.LocalEnv)

		sessions = append(sessions, session)
	}
	return sessions, nil
}

// UpdateSession 更新会话
func (s *Store) UpdateSession(session *Session) error {
	session.UpdatedAt = FlexibleTime{Time: time.Now()}
	loginScriptJSON, _ := json.Marshal(session.LoginScript)
	tagsJSON, _ := json.Marshal(session.Tags)
	localEnvJSON, _ := json.Marshal(session.LocalEnv)

	_, err := s.db.Exec(`
		UPDATE sessions SET
			name = ?, group_path = ?, description = ?, host = ?, port = ?, user = ?,
			auth_type = ?, password = ?, key_path = ?, key_passphrase = ?, keep_alive = ?,
			proxy_jump = ?, proxy_command = ?, terminal_type = ?, font_size = ?,
			font_family = ?, theme_id = ?, encoding = ?, login_script = ?, tags = ?,
			local_env = ?, updated_at = ?
		WHERE id = ?
	`,
		session.Name, session.Group, session.Description,
		session.Host, session.Port, session.User,
		string(session.AuthType), session.Password, session.KeyPath, session.KeyPassphrase,
		session.KeepAlive, session.ProxyJump, session.ProxyCommand,
		session.TerminalType, session.FontSize, session.FontFamily,
		session.ThemeID, session.Encoding, string(loginScriptJSON), string(tagsJSON),
		string(localEnvJSON), session.UpdatedAt.Format(time.RFC3339), session.ID,
	)
	return err
}

// UpdateLastUsed 更新最后使用时间
func (s *Store) UpdateLastUsed(id string) error {
	_, err := s.db.Exec(`
		UPDATE sessions SET last_used_at = ? WHERE id = ?
	`, time.Now().Format(time.RFC3339), id)
	return err
}

// DeleteSession 删除会话
func (s *Store) DeleteSession(id string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE id = ?`, id)
	return err
}

// CloneSession 克隆会话
func (s *Store) CloneSession(id string) (*Session, error) {
	original, err := s.GetSession(id)
	if err != nil {
		return nil, err
	}

	cloned := NewSession(original.Name+" (副本)", original.Protocol)
	cloned.Group = original.Group
	cloned.Description = original.Description
	cloned.Host = original.Host
	cloned.Port = original.Port
	cloned.User = original.User
	cloned.AuthType = original.AuthType
	cloned.Password = original.Password
	cloned.KeyPath = original.KeyPath
	cloned.KeyPassphrase = original.KeyPassphrase
	cloned.KeepAlive = original.KeepAlive
	cloned.ProxyJump = original.ProxyJump
	cloned.ProxyCommand = original.ProxyCommand
	cloned.TerminalType = original.TerminalType
	cloned.FontSize = original.FontSize
	cloned.FontFamily = original.FontFamily
	cloned.ThemeID = original.ThemeID
	cloned.Encoding = original.Encoding
	cloned.DataBits = original.DataBits
	cloned.StopBits = original.StopBits
	cloned.Parity = original.Parity
	cloned.LoginScript = original.LoginScript
	cloned.Tags = original.Tags

	if err := s.CreateSession(cloned); err != nil {
		return nil, err
	}

	return cloned, nil
}

// buildGroupPath 构建完整的层级路径
func (s *Store) buildGroupPath(parentID, name string) string {
	if parentID == "" {
		return "/" + name
	}
	parent, err := s.GetGroup(parentID)
	if err != nil || parent == nil {
		return "/" + name
	}
	return parent.Path + "/" + name
}

// GetGroup 获取单个分组
func (s *Store) GetGroup(id string) (*Group, error) {
	row := s.db.QueryRow(`
		SELECT id, name, parent_id, path, created_at, updated_at
		FROM groups WHERE id = ?
	`, id)

	group := &Group{}
	var createdAt, updatedAt sql.NullString
	err := row.Scan(
		&group.ID, &group.Name, &group.ParentID, &group.Path,
		&createdAt, &updatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("group not found")
		}
		return nil, err
	}

	if createdAt.Valid {
		t, _ := time.Parse(time.RFC3339, createdAt.String)
		group.CreatedAt = FlexibleTime{Time: t}
	}
	if updatedAt.Valid {
		t, _ := time.Parse(time.RFC3339, updatedAt.String)
		group.UpdatedAt = FlexibleTime{Time: t}
	}

	return group, nil
}

// CreateGroup 创建分组
func (s *Store) CreateGroup(group *Group) error {
	// 构建完整路径
	group.Path = s.buildGroupPath(group.ParentID, group.Name)

	_, err := s.db.Exec(`
		INSERT INTO groups (id, name, parent_id, path, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
	`, group.ID, group.Name, group.ParentID, group.Path, group.CreatedAt.Format(time.RFC3339), group.UpdatedAt.Format(time.RFC3339))
	return err
}

// ListGroups 列出所有分组
func (s *Store) ListGroups() ([]*Group, error) {
	rows, err := s.db.Query(`
		SELECT id, name, parent_id, path, created_at, updated_at
		FROM groups ORDER BY path
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*Group
	for rows.Next() {
		group := &Group{}
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&group.ID, &group.Name, &group.ParentID, &group.Path,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			t, _ := time.Parse(time.RFC3339, createdAt.String)
			group.CreatedAt = FlexibleTime{Time: t}
		}
		if updatedAt.Valid {
			t, _ := time.Parse(time.RFC3339, updatedAt.String)
			group.UpdatedAt = FlexibleTime{Time: t}
		}
		groups = append(groups, group)
	}
	return groups, nil
}

// DeleteGroup 删除分组，并将该分组下的会话移动到未分组
func (s *Store) DeleteGroup(id string) error {
	// 先获取分组路径
	group, err := s.GetGroup(id)
	if err != nil {
		// 分组不存在，直接返回
		return nil
	}

	// 将该分组下的会话移动到未分组（使用路径匹配）
	_, err = s.db.Exec(`UPDATE sessions SET group_path = '' WHERE group_path = ?`, group.Path)
	if err != nil {
		return err
	}

	// 删除分组
	_, err = s.db.Exec(`DELETE FROM groups WHERE id = ?`, id)
	return err
}

// UpdateGroup 更新分组名称
func (s *Store) UpdateGroup(id string, name string) (*Group, error) {
	// 先获取旧的分组信息
	group, err := s.GetGroup(id)
	if err != nil {
		return nil, err
	}
	oldPath := group.Path

	// 构建新路径
	newPath := s.buildGroupPath(group.ParentID, name)

	now := time.Now()
	_, err = s.db.Exec(`UPDATE groups SET name = ?, path = ?, updated_at = ? WHERE id = ?`, name, newPath, now.Format(time.RFC3339), id)
	if err != nil {
		return nil, err
	}

	// 更新该分组下会话的 group_path（使用旧路径匹配）
	_, err = s.db.Exec(`UPDATE sessions SET group_path = ? WHERE group_path = ?`, newPath, oldPath)
	if err != nil {
		return nil, err
	}

	// 更新所有子分组的路径
	err = s.updateChildPaths(id, oldPath, newPath)
	if err != nil {
		return nil, err
	}

	// 返回更新后的分组
	return s.GetGroup(id)
}

// UpdateGroupParent 移动分组到新父级
func (s *Store) UpdateGroupParent(id string, newParentID string) error {
	// 获取当前分组
	group, err := s.GetGroup(id)
	if err != nil {
		return err
	}
	oldPath := group.Path

	// 检查不能移动到自己或自己的子分组
	if id == newParentID {
		return fmt.Errorf("cannot move group to itself")
	}
	if s.isDescendant(id, newParentID) {
		return fmt.Errorf("cannot move group to its descendant")
	}

	// 构建新路径
	newPath := s.buildGroupPath(newParentID, group.Name)

	now := time.Now()
	_, err = s.db.Exec(`UPDATE groups SET parent_id = ?, path = ?, updated_at = ? WHERE id = ?`, newParentID, newPath, now.Format(time.RFC3339), id)
	if err != nil {
		return err
	}

	// 更新该分组下会话的 group_path
	_, err = s.db.Exec(`UPDATE sessions SET group_path = ? WHERE group_path = ?`, newPath, oldPath)
	if err != nil {
		return err
	}

	// 更新所有子分组的路径
	return s.updateChildPaths(id, oldPath, newPath)
}

// isDescendant 检查 targetID 是否是 groupID 的子孙
func (s *Store) isDescendant(groupID, targetID string) bool {
	group, err := s.GetGroup(targetID)
	if err != nil {
		return false
	}
	// 检查 target 的父级链是否包含 groupID
	for group.ParentID != "" {
		if group.ParentID == groupID {
			return true
		}
		group, err = s.GetGroup(group.ParentID)
		if err != nil {
			return false
		}
	}
	return false
}

// updateChildPaths 更新所有子分组的路径
func (s *Store) updateChildPaths(parentID, oldParentPath, newParentPath string) error {
	children, err := s.GetChildGroups(parentID)
	if err != nil {
		return err
	}

	for _, child := range children {
		oldChildPath := child.Path
		// 替换路径前缀
		newChildPath := newParentPath + "/" + child.Name

		_, err = s.db.Exec(`UPDATE groups SET path = ? WHERE id = ?`, newChildPath, child.ID)
		if err != nil {
			return err
		}

		// 更新该子分组下会话的 group_path
		_, err = s.db.Exec(`UPDATE sessions SET group_path = ? WHERE group_path = ?`, newChildPath, oldChildPath)
		if err != nil {
			return err
		}

		// 递归更新孙子分组
		err = s.updateChildPaths(child.ID, oldChildPath, newChildPath)
		if err != nil {
			return err
		}
	}

	return nil
}

// GetChildGroups 获取子分组列表
func (s *Store) GetChildGroups(parentID string) ([]*Group, error) {
	rows, err := s.db.Query(`
		SELECT id, name, parent_id, path, created_at, updated_at
		FROM groups WHERE parent_id = ? ORDER BY name
	`, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []*Group
	for rows.Next() {
		group := &Group{}
		var createdAt, updatedAt sql.NullString
		err := rows.Scan(
			&group.ID, &group.Name, &group.ParentID, &group.Path,
			&createdAt, &updatedAt,
		)
		if err != nil {
			return nil, err
		}
		if createdAt.Valid {
			t, _ := time.Parse(time.RFC3339, createdAt.String)
			group.CreatedAt = FlexibleTime{Time: t}
		}
		if updatedAt.Valid {
			t, _ := time.Parse(time.RFC3339, updatedAt.String)
			group.UpdatedAt = FlexibleTime{Time: t}
		}
		groups = append(groups, group)
	}
	return groups, nil
}

// DeleteGroupRecursive 递归删除分组及其所有子分组，会话移动到未分组
func (s *Store) DeleteGroupRecursive(id string) error {
	// 获取分组路径
	group, err := s.GetGroup(id)
	if err != nil {
		return nil // 分组不存在，直接返回
	}

	// 将所有以该分组路径开头的会话移动到未分组（包括子分组中的会话）
	_, err = s.db.Exec(`UPDATE sessions SET group_path = '' WHERE group_path LIKE ?`, group.Path+"/%")
	if err != nil {
		return err
	}
	// 将该分组本身的会话移动到未分组
	_, err = s.db.Exec(`UPDATE sessions SET group_path = '' WHERE group_path = ?`, group.Path)
	if err != nil {
		return err
	}

	// 删除所有以该分组路径开头的子分组
	_, err = s.db.Exec(`DELETE FROM groups WHERE path LIKE ?`, group.Path+"/%")
	if err != nil {
		return err
	}
	// 删除该分组本身
	_, err = s.db.Exec(`DELETE FROM groups WHERE id = ?`, id)
	return err
}

// ListGroupsTree 返回树形结构的分组列表
func (s *Store) ListGroupsTree() ([]*GroupNode, error) {
	groups, err := s.ListGroups()
	if err != nil {
		return nil, err
	}

	// 构建分组映射
	groupMap := make(map[string]*GroupNode)
	for _, g := range groups {
		groupMap[g.ID] = &GroupNode{
			Group:    g,
			Children: []*GroupNode{},
		}
	}

	// 构建树形结构
	var rootNodes []*GroupNode
	for _, g := range groups {
		node := groupMap[g.ID]
		if g.ParentID == "" {
			// 根分组
			rootNodes = append(rootNodes, node)
		} else {
			// 子分组，添加到父分组的 children
			if parent, ok := groupMap[g.ParentID]; ok {
				parent.Children = append(parent.Children, node)
			} else {
				// 父分组不存在，作为根分组处理
				rootNodes = append(rootNodes, node)
			}
		}
	}

	return rootNodes, nil
}
