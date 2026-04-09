package command

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Store 命令存储
type Store struct {
	db *sql.DB
}

// NewStore 创建命令存储实例
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
	// 命令表
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS commands (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			group_path TEXT DEFAULT '',
			description TEXT DEFAULT '',
			content TEXT NOT NULL,
			variables TEXT DEFAULT '',
			shortcut TEXT DEFAULT '',
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)
	`)
	if err != nil {
		return err
	}

	// 命令分组表
	_, err = s.db.Exec(`
		CREATE TABLE IF NOT EXISTS command_groups (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			parent_id TEXT DEFAULT '',
			path TEXT NOT NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL
		)
	`)
	return err
}

// Close 关闭数据库
func (s *Store) Close() error {
	return s.db.Close()
}

// CreateCommand 创建命令
func (s *Store) CreateCommand(cmd *Command) error {
	varsJSON, _ := json.Marshal(cmd.Variables)

	_, err := s.db.Exec(`
		INSERT INTO commands (
			id, name, group_path, description, content, variables, shortcut, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		cmd.ID, cmd.Name, cmd.Group, cmd.Description,
		cmd.Content, string(varsJSON), cmd.Shortcut,
		cmd.CreatedAt, cmd.UpdatedAt,
	)
	return err
}

// GetCommand 获取命令
func (s *Store) GetCommand(id string) (*Command, error) {
	row := s.db.QueryRow(`
		SELECT id, name, group_path, description, content, variables, shortcut, created_at, updated_at
		FROM commands WHERE id = ?
	`, id)

	cmd := &Command{}
	var varsJSON string

	err := row.Scan(
		&cmd.ID, &cmd.Name, &cmd.Group, &cmd.Description,
		&cmd.Content, &varsJSON, &cmd.Shortcut,
		&cmd.CreatedAt, &cmd.UpdatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("command not found")
		}
		return nil, err
	}

	json.Unmarshal([]byte(varsJSON), &cmd.Variables)
	return cmd, nil
}

// ListCommands 列出所有命令
func (s *Store) ListCommands() ([]*Command, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, content, variables, shortcut, created_at, updated_at
		FROM commands ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanCommands(rows)
}

// ListCommandsByGroup 按分组列出命令
func (s *Store) ListCommandsByGroup(group string) ([]*Command, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, content, variables, shortcut, created_at, updated_at
		FROM commands WHERE group_path = ? ORDER BY name
	`, group)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanCommands(rows)
}

// SearchCommands 搜索命令
func (s *Store) SearchCommands(keyword string) ([]*Command, error) {
	rows, err := s.db.Query(`
		SELECT id, name, group_path, description, content, variables, shortcut, created_at, updated_at
		FROM commands WHERE name LIKE ? OR content LIKE ? OR description LIKE ?
		ORDER BY name
	`, "%"+keyword+"%", "%"+keyword+"%", "%"+keyword+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	return s.scanCommands(rows)
}

// scanCommands 扫描命令列表
func (s *Store) scanCommands(rows *sql.Rows) ([]*Command, error) {
	var commands []*Command
	for rows.Next() {
		cmd := &Command{}
		var varsJSON string

		err := rows.Scan(
			&cmd.ID, &cmd.Name, &cmd.Group, &cmd.Description,
			&cmd.Content, &varsJSON, &cmd.Shortcut,
			&cmd.CreatedAt, &cmd.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		json.Unmarshal([]byte(varsJSON), &cmd.Variables)
		commands = append(commands, cmd)
	}
	return commands, nil
}

// UpdateCommand 更新命令
func (s *Store) UpdateCommand(cmd *Command) error {
	cmd.UpdatedAt = time.Now()
	varsJSON, _ := json.Marshal(cmd.Variables)

	_, err := s.db.Exec(`
		UPDATE commands SET
			name = ?, group_path = ?, description = ?, content = ?,
			variables = ?, shortcut = ?, updated_at = ?
		WHERE id = ?
	`,
		cmd.Name, cmd.Group, cmd.Description, cmd.Content,
		string(varsJSON), cmd.Shortcut, cmd.UpdatedAt, cmd.ID,
	)
	return err
}

// DeleteCommand 删除命令
func (s *Store) DeleteCommand(id string) error {
	_, err := s.db.Exec(`DELETE FROM commands WHERE id = ?`, id)
	return err
}