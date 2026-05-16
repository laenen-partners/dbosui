package dbosui

import (
	"context"
	"fmt"
	"math/rand"
	"sort"
	"strings"
	"time"
)

// WorkflowStatus represents the execution status of a workflow.
type WorkflowStatus string

const (
	StatusPending   WorkflowStatus = "PENDING"
	StatusEnqueued  WorkflowStatus = "ENQUEUED"
	StatusSuccess   WorkflowStatus = "SUCCESS"
	StatusError     WorkflowStatus = "ERROR"
	StatusCancelled WorkflowStatus = "CANCELLED"
	StatusRetries   WorkflowStatus = "MAX_RETRIES_EXCEEDED"
)

// AllStatuses is the list of all known workflow statuses.
var AllStatuses = []WorkflowStatus{
	StatusPending, StatusEnqueued, StatusSuccess,
	StatusError, StatusCancelled, StatusRetries,
}

// WorkflowInfo holds the details of a single workflow execution.
type WorkflowInfo struct {
	ID                 string
	Status             WorkflowStatus
	Name               string
	AuthenticatedUser  string
	Input              any
	Output             any
	Error              string
	CreatedAt          time.Time
	UpdatedAt          time.Time
	ApplicationVersion string
	ApplicationID      string
	QueueName          string
	Attempts           int
	ExecutorID         string
}

// StepInfo holds details about a single workflow step.
type StepInfo struct {
	StepID int
	Name   string
	Output any
	Error  string
}

// EventInfo holds a key-value pair set via dbos.SetEvent.
type EventInfo struct {
	Key   string
	Value string
}

// ListFilter configures workflow listing and filtering.
type ListFilter struct {
	Status             []WorkflowStatus
	Name               string
	Limit              int
	Offset             int
	SortDesc           bool
	User               string
	IDPrefix           string
	QueueName          string
	ExecutorID         string
	ApplicationVersion string
	// CreatedAfter / CreatedBefore are inclusive bounds on created_at. Zero
	// time means unbounded.
	CreatedAfter  time.Time
	CreatedBefore time.Time
}

// DistinctField identifies a column on workflow_status that can be enumerated
// for filter dropdowns.
type DistinctField string

const (
	DistinctName               DistinctField = "name"
	DistinctQueueName          DistinctField = "queue_name"
	DistinctExecutorID         DistinctField = "executor_id"
	DistinctApplicationVersion DistinctField = "application_version"
	DistinctAuthenticatedUser  DistinctField = "authenticated_user"
)

// ListResult is the result of listing workflows with total count.
type ListResult struct {
	Workflows []WorkflowInfo
	Total     int
}

// Stats holds workflow count data for the stats bar.
type Stats struct {
	Total     int
	Pending   int
	Success   int
	Failed    int
	Cancelled int
}

// QueueStats holds per-queue rollup counts.
type QueueStats struct {
	QueueName string
	Total     int
	Pending   int
	Enqueued  int
	Success   int
	Failed    int
	Cancelled int
}

// Notification represents a row in the dbos.notifications table, i.e. a
// message sent via dbos.Send awaiting consumption by dbos.Recv.
type Notification struct {
	DestinationWorkflowID string
	Topic                 string
	Message               string
	CreatedAt             time.Time
}

// NotificationsFilter narrows ListNotifications to a destination workflow
// and/or topic, and supports limit/offset paging.
type NotificationsFilter struct {
	DestinationWorkflowID string
	Topic                 string
	Limit                 int
	Offset                int
}

// NotificationsResult is the result of ListNotifications.
type NotificationsResult struct {
	Notifications []Notification
	Total         int
}

// Client abstracts access to DBOS workflow data.
// Implement this interface using the DBOS Go client or direct SQL (sqlc).
type Client interface {
	ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error)
	ListDistinctValues(ctx context.Context, field DistinctField) ([]string, error)
	ListQueueStats(ctx context.Context) ([]QueueStats, error)
	ListNotifications(ctx context.Context, filter NotificationsFilter) (*NotificationsResult, error)
	GetWorkflow(ctx context.Context, id string) (*WorkflowInfo, error)
	GetWorkflowSteps(ctx context.Context, id string) ([]StepInfo, error)
	GetWorkflowEvents(ctx context.Context, id string) ([]EventInfo, error)
	CancelWorkflow(ctx context.Context, id string) error
	ResumeWorkflow(ctx context.Context, id string) error
	DeleteWorkflow(ctx context.Context, id string) error
}

// MockClient returns an in-memory client with sample data for testing.
func MockClient() Client {
	return newMockClient()
}

type mockClient struct {
	workflows     []WorkflowInfo
	notifications []Notification
}

func newMockClient() *mockClient {
	now := time.Now()
	names := []string{
		"ProcessOrder", "SendNotification", "SyncInventory",
		"GenerateReport", "ProcessPayment", "UpdateUserProfile",
		"ImportData", "BackupDatabase", "SendEmail", "ReconcileAccounts",
	}
	statuses := []WorkflowStatus{
		StatusSuccess, StatusSuccess, StatusSuccess, StatusSuccess,
		StatusPending, StatusEnqueued,
		StatusError, StatusCancelled,
	}
	queues := []string{"default", "email-queue", "billing-queue", "imports-queue"}
	executors := []string{"executor-01", "executor-02", "executor-03"}
	versions := []string{"v1.2.3", "v1.2.4", "v1.3.0-rc1"}

	wfs := make([]WorkflowInfo, 50)
	for i := range wfs {
		status := statuses[i%len(statuses)]
		created := now.Add(-time.Duration(i) * 17 * time.Minute)
		updated := created.Add(time.Duration(rand.Intn(300)+10) * time.Second)
		attempts := 1
		if status == StatusError && i%2 == 0 {
			attempts = 3
		}
		wf := WorkflowInfo{
			ID:                 fmt.Sprintf("wf-%s-%04d", strings.ToLower(names[i%len(names)][:3]), 1000+i),
			Status:             status,
			Name:               names[i%len(names)],
			AuthenticatedUser:  fmt.Sprintf("user-%d", (i%3)+1),
			CreatedAt:          created,
			UpdatedAt:          updated,
			ApplicationVersion: versions[i%len(versions)],
			ApplicationID:      "my-app",
			QueueName:          queues[i%len(queues)],
			ExecutorID:         executors[i%len(executors)],
			Attempts:           attempts,
		}
		if status == StatusError {
			wf.Error = "context deadline exceeded: step timed out after 30s"
			wf.Attempts = 3
		}
		if status == StatusSuccess {
			wf.Output = map[string]any{"result": "ok", "items_processed": i * 10}
		}
		wf.Input = map[string]any{"trigger": "api", "batch_id": i}
		wfs[i] = wf
	}

	notifications := []Notification{
		{DestinationWorkflowID: wfs[1].ID, Topic: "payment.completed", Message: `{"amount":42.5,"currency":"USD"}`, CreatedAt: now.Add(-3 * time.Minute)},
		{DestinationWorkflowID: wfs[2].ID, Topic: "inventory.updated", Message: `{"sku":"AB-123","delta":-5}`, CreatedAt: now.Add(-12 * time.Minute)},
		{DestinationWorkflowID: wfs[5].ID, Topic: "email.bounced", Message: `{"address":"x@y.com","reason":"hard"}`, CreatedAt: now.Add(-30 * time.Minute)},
		{DestinationWorkflowID: wfs[7].ID, Topic: "user.signup", Message: `{"user_id":"u-991"}`, CreatedAt: now.Add(-1 * time.Hour)},
	}

	return &mockClient{workflows: wfs, notifications: notifications}
}

func (m *mockClient) ListWorkflows(_ context.Context, filter ListFilter) (*ListResult, error) {
	var filtered []WorkflowInfo
	for _, wf := range m.workflows {
		if len(filter.Status) > 0 {
			found := false
			for _, s := range filter.Status {
				if wf.Status == s {
					found = true
					break
				}
			}
			if !found {
				continue
			}
		}
		if filter.Name != "" && !strings.Contains(strings.ToLower(wf.Name), strings.ToLower(filter.Name)) {
			continue
		}
		if filter.IDPrefix != "" && !strings.HasPrefix(wf.ID, filter.IDPrefix) {
			continue
		}
		if filter.User != "" && wf.AuthenticatedUser != filter.User {
			continue
		}
		if filter.QueueName != "" && wf.QueueName != filter.QueueName {
			continue
		}
		if filter.ExecutorID != "" && wf.ExecutorID != filter.ExecutorID {
			continue
		}
		if filter.ApplicationVersion != "" && wf.ApplicationVersion != filter.ApplicationVersion {
			continue
		}
		if !filter.CreatedAfter.IsZero() && wf.CreatedAt.Before(filter.CreatedAfter) {
			continue
		}
		if !filter.CreatedBefore.IsZero() && wf.CreatedAt.After(filter.CreatedBefore) {
			continue
		}
		filtered = append(filtered, wf)
	}

	if filter.SortDesc {
		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
		})
	} else {
		sort.Slice(filtered, func(i, j int) bool {
			return filtered[i].CreatedAt.Before(filtered[j].CreatedAt)
		})
	}

	total := len(filtered)
	limit := filter.Limit
	if limit <= 0 {
		limit = 25
	}
	offset := filter.Offset
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	filtered = filtered[offset:end]

	return &ListResult{Workflows: filtered, Total: total}, nil
}

func (m *mockClient) ListNotifications(_ context.Context, filter NotificationsFilter) (*NotificationsResult, error) {
	var filtered []Notification
	for _, n := range m.notifications {
		if filter.DestinationWorkflowID != "" && n.DestinationWorkflowID != filter.DestinationWorkflowID {
			continue
		}
		if filter.Topic != "" && n.Topic != filter.Topic {
			continue
		}
		filtered = append(filtered, n)
	}
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
	})
	total := len(filtered)

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	offset := filter.Offset
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return &NotificationsResult{Notifications: filtered[offset:end], Total: total}, nil
}

func (m *mockClient) ListQueueStats(_ context.Context) ([]QueueStats, error) {
	byQueue := make(map[string]*QueueStats)
	for _, wf := range m.workflows {
		q := wf.QueueName
		stat, ok := byQueue[q]
		if !ok {
			stat = &QueueStats{QueueName: q}
			byQueue[q] = stat
		}
		stat.Total++
		switch wf.Status {
		case StatusPending:
			stat.Pending++
		case StatusEnqueued:
			stat.Enqueued++
		case StatusSuccess:
			stat.Success++
		case StatusError, StatusRetries:
			stat.Failed++
		case StatusCancelled:
			stat.Cancelled++
		}
	}
	result := make([]QueueStats, 0, len(byQueue))
	for _, s := range byQueue {
		result = append(result, *s)
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].QueueName < result[j].QueueName
	})
	return result, nil
}

func (m *mockClient) ListDistinctValues(_ context.Context, field DistinctField) ([]string, error) {
	pick := func(wf WorkflowInfo) string {
		switch field {
		case DistinctName:
			return wf.Name
		case DistinctQueueName:
			return wf.QueueName
		case DistinctExecutorID:
			return wf.ExecutorID
		case DistinctApplicationVersion:
			return wf.ApplicationVersion
		case DistinctAuthenticatedUser:
			return wf.AuthenticatedUser
		}
		return ""
	}
	seen := make(map[string]struct{}, len(m.workflows))
	for _, wf := range m.workflows {
		v := pick(wf)
		if v == "" {
			continue
		}
		seen[v] = struct{}{}
	}
	values := make([]string, 0, len(seen))
	for v := range seen {
		values = append(values, v)
	}
	sort.Strings(values)
	return values, nil
}

func (m *mockClient) GetWorkflow(_ context.Context, id string) (*WorkflowInfo, error) {
	for _, wf := range m.workflows {
		if wf.ID == id {
			return &wf, nil
		}
	}
	return nil, fmt.Errorf("workflow %q not found", id)
}

func (m *mockClient) GetWorkflowSteps(_ context.Context, id string) ([]StepInfo, error) {
	for _, wf := range m.workflows {
		if wf.ID != id {
			continue
		}
		steps := []StepInfo{
			{StepID: 1, Name: "validate_input", Output: map[string]any{"valid": true}},
			{StepID: 2, Name: "process_data", Output: map[string]any{"rows": 42}},
		}
		if wf.Status == StatusError {
			steps = append(steps, StepInfo{StepID: 3, Name: "finalize", Error: wf.Error})
		} else if wf.Status == StatusSuccess {
			steps = append(steps, StepInfo{StepID: 3, Name: "finalize", Output: map[string]any{"status": "complete"}})
		}
		return steps, nil
	}
	return nil, fmt.Errorf("workflow %q not found", id)
}

func (m *mockClient) GetWorkflowEvents(_ context.Context, id string) ([]EventInfo, error) {
	for _, wf := range m.workflows {
		if wf.ID == id {
			return []EventInfo{
				{Key: "status", Value: `"processing"`},
				{Key: "progress", Value: `{"percent": 75, "step": "validation"}`},
			}, nil
		}
	}
	return nil, fmt.Errorf("workflow %q not found", id)
}

func (m *mockClient) CancelWorkflow(_ context.Context, id string) error {
	for i, wf := range m.workflows {
		if wf.ID == id {
			m.workflows[i].Status = StatusCancelled
			m.workflows[i].UpdatedAt = time.Now()
			return nil
		}
	}
	return fmt.Errorf("workflow %q not found", id)
}

func (m *mockClient) ResumeWorkflow(_ context.Context, id string) error {
	for i, wf := range m.workflows {
		if wf.ID == id {
			m.workflows[i].Status = StatusPending
			m.workflows[i].UpdatedAt = time.Now()
			return nil
		}
	}
	return fmt.Errorf("workflow %q not found", id)
}

func (m *mockClient) DeleteWorkflow(_ context.Context, id string) error {
	for i, wf := range m.workflows {
		if wf.ID == id {
			m.workflows = append(m.workflows[:i], m.workflows[i+1:]...)
			return nil
		}
	}
	return fmt.Errorf("workflow %q not found", id)
}
