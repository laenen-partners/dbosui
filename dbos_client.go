package dbosui

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dbos-inc/dbos-transact-golang/dbos"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DBOSClient connects to a DBOS system database using the official DBOS Go client
// and a direct pgx pool for queries the client doesn't support (events, name search).
type DBOSClient struct {
	client dbos.Client
	pool   *pgxpool.Pool
	schema string
}

// NewDBOSClient creates a client that connects to the DBOS system database
// at the given Postgres URL.
func NewDBOSClient(ctx context.Context, databaseURL string) (*DBOSClient, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("dbosui: connect to database: %w", err)
	}

	client, err := dbos.NewClient(ctx, dbos.ClientConfig{
		SystemDBPool: pool,
	})
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("dbosui: create DBOS client: %w", err)
	}

	return &DBOSClient{
		client: client,
		pool:   pool,
		schema: "dbos",
	}, nil
}

// Shutdown closes the database connection.
func (c *DBOSClient) Shutdown(timeout time.Duration) {
	c.client.Shutdown(timeout)
	c.pool.Close()
}

func (c *DBOSClient) ListWorkflows(ctx context.Context, filter ListFilter) (*ListResult, error) {
	// If there's a name search, query the DB directly with ILIKE for substring matching.
	// The DBOS client's WithName does exact match only.
	if filter.Name != "" {
		return c.listWorkflowsByName(ctx, filter)
	}

	var opts []dbos.ListWorkflowsOption

	if len(filter.Status) > 0 {
		statuses := make([]dbos.WorkflowStatusType, len(filter.Status))
		for i, s := range filter.Status {
			statuses[i] = dbos.WorkflowStatusType(s)
		}
		opts = append(opts, dbos.WithStatus(statuses))
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

// listWorkflowsByName queries the DB directly with ILIKE for substring name search.
func (c *DBOSClient) listWorkflowsByName(ctx context.Context, filter ListFilter) (*ListResult, error) {
	args := []any{"%" + strings.ToLower(filter.Name) + "%"}
	where := "WHERE LOWER(name) LIKE $1"
	argIdx := 2

	if len(filter.Status) > 0 {
		placeholders := make([]string, len(filter.Status))
		for i, s := range filter.Status {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, string(s))
			argIdx++
		}
		where += fmt.Sprintf(" AND status IN (%s)", strings.Join(placeholders, ","))
	}

	// Count total matching.
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s.workflow_status %s", c.schema, where)
	var total int
	if err := c.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("dbosui: count workflows: %w", err)
	}

	// Fetch page.
	order := "ASC"
	if filter.SortDesc {
		order = "DESC"
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 25
	}

	dataQuery := fmt.Sprintf(
		`SELECT workflow_uuid, status, name, COALESCE(authenticated_user,''), executor_id,
		        created_at, updated_at, COALESCE(application_version,''), COALESCE(application_id,''),
		        COALESCE(recovery_attempts,0), COALESCE(queue_name,''),
		        COALESCE(output,''), COALESCE(error,''), COALESCE(inputs,'')
		 FROM %s.workflow_status %s
		 ORDER BY created_at %s
		 LIMIT $%d OFFSET $%d`,
		c.schema, where, order, argIdx, argIdx+1,
	)
	args = append(args, limit, filter.Offset)

	rows, err := c.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("dbosui: query workflows: %w", err)
	}
	defer rows.Close()

	var workflows []WorkflowInfo
	for rows.Next() {
		var wf WorkflowInfo
		var createdAtMs, updatedAtMs int64
		var output, errStr, inputs string
		if err := rows.Scan(
			&wf.ID, &wf.Status, &wf.Name, &wf.AuthenticatedUser, &wf.ExecutorID,
			&createdAtMs, &updatedAtMs, &wf.ApplicationVersion, &wf.ApplicationID,
			&wf.Attempts, &wf.QueueName,
			&output, &errStr, &inputs,
		); err != nil {
			return nil, fmt.Errorf("dbosui: scan workflow: %w", err)
		}
		wf.CreatedAt = time.UnixMilli(createdAtMs)
		wf.UpdatedAt = time.UnixMilli(updatedAtMs)
		wf.Error = errStr
		if output != "" {
			wf.Output = output
		}
		if inputs != "" {
			wf.Input = inputs
		}
		workflows = append(workflows, wf)
	}

	return &ListResult{Workflows: workflows, Total: total}, nil
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

// GetWorkflowEvents queries the workflow_events table for data set via dbos.SetEvent.
func (c *DBOSClient) GetWorkflowEvents(ctx context.Context, id string) ([]EventInfo, error) {
	query := fmt.Sprintf(
		"SELECT key, value FROM %s.workflow_events WHERE workflow_uuid = $1 ORDER BY key",
		c.schema,
	)
	rows, err := c.pool.Query(ctx, query, id)
	if err != nil {
		return nil, fmt.Errorf("dbosui: query workflow events: %w", err)
	}
	defer rows.Close()

	var events []EventInfo
	for rows.Next() {
		var e EventInfo
		var rawValue string
		if err := rows.Scan(&e.Key, &rawValue); err != nil {
			return nil, fmt.Errorf("dbosui: scan event: %w", err)
		}
		e.Value = decodeDBOSValue(rawValue)
		events = append(events, e)
	}
	return events, nil
}

func (c *DBOSClient) CancelWorkflow(_ context.Context, id string) error {
	return c.client.CancelWorkflow(id)
}

func (c *DBOSClient) ResumeWorkflow(_ context.Context, id string) error {
	_, err := c.client.ResumeWorkflow(id)
	return err
}

func (c *DBOSClient) DeleteWorkflow(ctx context.Context, id string) error {
	query := fmt.Sprintf("DELETE FROM %s.workflow_status WHERE workflow_uuid = $1", c.schema)
	result, err := c.pool.Exec(ctx, query, id)
	if err != nil {
		return fmt.Errorf("dbosui: delete workflow: %w", err)
	}
	if result.RowsAffected() == 0 {
		return fmt.Errorf("dbosui: workflow %q not found", id)
	}
	return nil
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
