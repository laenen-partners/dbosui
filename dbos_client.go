package dbosui

import (
	"context"
	"fmt"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
)

// DBOSClient connects to a DBOS system database using the official DBOS Go client.
type DBOSClient struct {
	client dbos.Client
}

// NewDBOSClient creates a client that connects to the DBOS system database
// at the given Postgres URL.
func NewDBOSClient(ctx context.Context, databaseURL string) (*DBOSClient, error) {
	client, err := dbos.NewClient(ctx, dbos.ClientConfig{
		DatabaseURL: databaseURL,
	})
	if err != nil {
		return nil, fmt.Errorf("dbosui: connect to DBOS database: %w", err)
	}
	return &DBOSClient{client: client}, nil
}

// Shutdown closes the database connection.
func (c *DBOSClient) Shutdown(timeout time.Duration) {
	c.client.Shutdown(timeout)
}

func (c *DBOSClient) ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error) {
	var opts []dbos.ListWorkflowsOption

	if len(filter.Status) > 0 {
		statuses := make([]dbos.WorkflowStatusType, len(filter.Status))
		for i, s := range filter.Status {
			statuses[i] = dbos.WorkflowStatusType(s)
		}
		opts = append(opts, dbos.WithStatus(statuses))
	}
	if filter.Name != "" {
		opts = append(opts, dbos.WithName(filter.Name))
	}
	if filter.User != "" {
		opts = append(opts, dbos.WithUser(filter.User))
	}
	if filter.IDPrefix != "" {
		opts = append(opts, dbos.WithWorkflowIDPrefix(filter.IDPrefix))
	}
	if filter.Limit > 0 {
		opts = append(opts, dbos.WithLimit(filter.Limit))
	}
	if filter.Offset > 0 {
		opts = append(opts, dbos.WithOffset(filter.Offset))
	}
	if filter.SortDesc {
		opts = append(opts, dbos.WithSortDesc())
	}

	workflows, err := c.client.ListWorkflows(opts...)
	if err != nil {
		return nil, fmt.Errorf("dbosui: list workflows: %w", err)
	}

	result := &ListResult{
		Total:     len(workflows),
		Workflows: make([]WorkflowInfo, len(workflows)),
	}
	for i, wf := range workflows {
		result.Workflows[i] = fromDBOS(wf)
	}
	return result, nil
}

func (c *DBOSClient) GetWorkflow(ctx context.Context, id string) (*WorkflowInfo, error) {
	workflows, err := c.client.ListWorkflows(
		dbos.WithWorkflowIDs([]string{id}),
	)
	if err != nil {
		return nil, fmt.Errorf("dbosui: get workflow: %w", err)
	}
	if len(workflows) == 0 {
		return nil, fmt.Errorf("dbosui: workflow %q not found", id)
	}
	info := fromDBOS(workflows[0])
	return &info, nil
}

func (c *DBOSClient) GetWorkflowSteps(ctx context.Context, id string) ([]StepInfo, error) {
	steps, err := c.client.GetWorkflowSteps(id)
	if err != nil {
		return nil, fmt.Errorf("dbosui: get workflow steps: %w", err)
	}
	result := make([]StepInfo, len(steps))
	for i, s := range steps {
		result[i] = StepInfo{
			StepID: s.StepID,
			Name:   s.StepName,
			Output: s.Output,
		}
		if s.Error != nil {
			result[i].Error = s.Error.Error()
		}
	}
	return result, nil
}

func (c *DBOSClient) CancelWorkflow(_ context.Context, id string) error {
	return c.client.CancelWorkflow(id)
}

func (c *DBOSClient) ResumeWorkflow(_ context.Context, id string) error {
	_, err := c.client.ResumeWorkflow(id)
	return err
}

// fromDBOS converts a dbos.WorkflowStatus to our WorkflowInfo.
func fromDBOS(wf dbos.WorkflowStatus) WorkflowInfo {
	info := WorkflowInfo{
		ID:                 wf.ID,
		Status:             WorkflowStatus(wf.Status),
		Name:               wf.Name,
		AuthenticatedUser:  wf.AuthenticatedUser,
		Input:              wf.Input,
		Output:             wf.Output,
		CreatedAt:          wf.CreatedAt,
		UpdatedAt:          wf.UpdatedAt,
		ApplicationVersion: wf.ApplicationVersion,
		ApplicationID:      wf.ApplicationID,
		QueueName:          wf.QueueName,
		Attempts:           wf.Attempts,
		ExecutorID:         wf.ExecutorID,
	}
	if wf.Error != nil {
		info.Error = wf.Error.Error()
	}
	return info
}
