package command

import (
	"path/filepath"
	"testing"
	"time"
)

func TestStoreCRUD(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	// Create command
	now := time.Now()
	cmd := &Command{
		ID:          "cmd-001",
		Name:        "List Files",
		Content:     "ls -la {{path}}",
		Description: "List files in directory",
		Group:       "File Ops",
		Variables: []Variable{
			{Name: "path", Default: ".", Description: "Directory path"},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	err = store.CreateCommand(cmd)
	if err != nil {
		t.Fatalf("Failed to create command: %v", err)
	}

	// Get command
	retrieved, err := store.GetCommand(cmd.ID)
	if err != nil {
		t.Fatalf("Failed to get command: %v", err)
	}

	if retrieved.Name != cmd.Name {
		t.Errorf("Retrieved name = %s, expected %s", retrieved.Name, cmd.Name)
	}
	if retrieved.Content != cmd.Content {
		t.Errorf("Retrieved content = %s, expected %s", retrieved.Content, cmd.Content)
	}
	if len(retrieved.Variables) != 1 {
		t.Errorf("Variables count = %d, expected 1", len(retrieved.Variables))
	}

	// Update command
	retrieved.Description = "Updated description"
	err = store.UpdateCommand(retrieved)
	if err != nil {
		t.Fatalf("Failed to update command: %v", err)
	}

	updated, err := store.GetCommand(cmd.ID)
	if err != nil {
		t.Fatalf("Failed to get updated command: %v", err)
	}
	if updated.Description != "Updated description" {
		t.Error("Command update failed")
	}

	// List commands
	commands, err := store.ListCommands()
	if err != nil {
		t.Fatalf("Failed to list commands: %v", err)
	}
	if len(commands) != 1 {
		t.Errorf("Commands count = %d, expected 1", len(commands))
	}

	// Delete command
	err = store.DeleteCommand(cmd.ID)
	if err != nil {
		t.Fatalf("Failed to delete command: %v", err)
	}

	commands, err = store.ListCommands()
	if err != nil {
		t.Fatalf("Failed to list commands after delete: %v", err)
	}
	if len(commands) != 0 {
		t.Errorf("Commands count after delete = %d, expected 0", len(commands))
	}
}

func TestStoreSearch(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	store, err := NewStore(dbPath)
	if err != nil {
		t.Fatalf("Failed to create store: %v", err)
	}
	defer store.Close()

	now := time.Now()
	commands := []*Command{
		{ID: "cmd-1", Name: "Disk Status", Content: "df -h", Group: "System", CreatedAt: now, UpdatedAt: now},
		{ID: "cmd-2", Name: "Memory Info", Content: "free -m", Group: "System", CreatedAt: now, UpdatedAt: now},
		{ID: "cmd-3", Name: "Network Check", Content: "ping -c 4 google.com", Group: "Network", CreatedAt: now, UpdatedAt: now},
	}

	for _, c := range commands {
		err = store.CreateCommand(c)
		if err != nil {
			t.Fatalf("Failed to create command: %v", err)
		}
	}

	// Search by name
	results, err := store.SearchCommands("Info")
	if err != nil {
		t.Fatalf("Failed to search: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("Search 'Info' returned %d results, expected 1", len(results))
	}

	// Search by content
	results, err = store.SearchCommands("ping")
	if err != nil {
		t.Fatalf("Failed to search: %v", err)
	}
	if len(results) != 1 {
		t.Errorf("Search 'ping' returned %d results, expected 1", len(results))
	}

	// List by group
	results, err = store.ListCommandsByGroup("System")
	if err != nil {
		t.Fatalf("Failed to list by group: %v", err)
	}
	if len(results) != 2 {
		t.Errorf("Commands in System group = %d, expected 2", len(results))
	}
}