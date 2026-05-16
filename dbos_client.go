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
	// Filters not supported by the SDK route us to the direct-SQL path.
	if filter.Name != "" ||
		filter.QueueName != "" ||
		filter.ExecutorID != "" ||
		filter.ApplicationVersion != "" ||
		!filter.CreatedAfter.IsZero() ||
		!filter.CreatedBefore.IsZero() {
		return c.listWorkflowsDirect(ctx, filter)
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

	// The DBOS SDK only returns the current page; query the total separately
	// so the UI can paginate correctly.
	total, err := c.countWorkflows(ctx, filter)
	if err != nil {
		return nil, err
	}

	result := &ListResult{
		Total:     total,
		Workflows: make([]WorkflowInfo, len(workflows)),
	}
	for i, wf := range workflows {
		result.Workflows[i] = fromDBOS(wf)
	}
	return result, nil
}

// buildFilterWhere assembles a parameterised WHERE clause covering every
// ListFilter field. argIdx is the placeholder index to start emitting at
// (so callers can prepend or append their own placeholders).
func buildFilterWhere(filter ListFilter, argIdx int) (string, []any, int) {
	where := "WHERE 1=1"
	var args []any

	if len(filter.Status) > 0 {
		placeholders := make([]string, len(filter.Status))
		for i, s := range filter.Status {
			placeholders[i] = fmt.Sprintf("$%d", argIdx)
			args = append(args, string(s))
			argIdx++
		}
		where += fmt.Sprintf(" AND status IN (%s)", strings.Join(placeholders, ","))
	}
	if filter.Name != "" {
		where += fmt.Sprintf(" AND LOWER(name) LIKE $%d", argIdx)
		args = append(args, "%"+strings.ToLower(filter.Name)+"%")
		argIdx++
	}
	if filter.User != "" {
		where += fmt.Sprintf(" AND authenticated_user = $%d", argIdx)
		args = append(args, filter.User)
		argIdx++
	}
	if filter.IDPrefix != "" {
		where += fmt.Sprintf(" AND workflow_uuid LIKE $%d", argIdx)
		args = append(args, filter.IDPrefix+"%")
		argIdx++
	}
	if filter.QueueName != "" {
		where += fmt.Sprintf(" AND queue_name = $%d", argIdx)
		args = append(args, filter.QueueName)
		argIdx++
	}
	if filter.ExecutorID != "" {
		where += fmt.Sprintf(" AND executor_id = $%d", argIdx)
		args = append(args, filter.ExecutorID)
		argIdx++
	}
	if filter.ApplicationVersion != "" {
		where += fmt.Sprintf(" AND application_version = $%d", argIdx)
		args = append(args, filter.ApplicationVersion)
		argIdx++
	}
	if !filter.CreatedAfter.IsZero() {
		where += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, filter.CreatedAfter.UnixMilli())
		argIdx++
	}
	if !filter.CreatedBefore.IsZero() {
		where += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, filter.CreatedBefore.UnixMilli())
		argIdx++
	}

	return where, args, argIdx
}

// countWorkflows returns the total number of rows matching the filter,
// ignoring limit/offset/sort.
func (c *DBOSClient) countWorkflows(ctx context.Context, filter ListFilter) (int, error) {
	where, args, _ := buildFilterWhere(filter, 1)
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s.workflow_status %s", c.schema, where)
	var total int
	if err := c.pool.QueryRow(ctx, query, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("dbosui: count workflows: %w", err)
	}
	return total, nil
}

// listWorkflowsDirect serves filter combinations the SDK doesn't expose
// (substring name search, queue/executor/application-version filters).
func (c *DBOSClient) listWorkflowsDirect(ctx context.Context, filter ListFilter) (*ListResult, error) {
	where, args, argIdx := buildFilterWhere(filter, 1)

	// Total count under the same WHERE clause.
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s.workflow_status %s", c.schema, where)
	var total int
	if err := c.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("dbosui: count workflows: %w", err)
	}

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

// ListSchedules queries dbos.workflow_schedules for registered cron and
// interval-scheduled workflows. If the table does not exist (older DBOS
// installs that haven't run migration 9), returns an empty slice rather than
// an error so the Schedules tab degrades gracefully.
func (c *DBOSClient) ListSchedules(ctx context.Context) ([]Schedule, error) {
	query := fmt.Sprintf(
		`SELECT
		   schedule_id,
		   schedule_name,
		   workflow_name,
		   COALESCE(workflow_class_name,''),
		   schedule,
		   status,
		   last_fired_at,
		   COALESCE(cron_timezone,''),
		   COALESCE(queue_name,''),
		   COALESCE(automatic_backfill,false)
		 FROM %s.workflow_schedules
		 ORDER BY schedule_name`,
		c.schema,
	)
	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		// Tolerate the table-missing case on older DBOS schemas.
		if strings.Contains(err.Error(), "does not exist") {
			return nil, nil
		}
		return nil, fmt.Errorf("dbosui: query schedules: %w", err)
	}
	defer rows.Close()

	var schedules []Schedule
	for rows.Next() {
		var s Schedule
		var lastFired *time.Time
		if err := rows.Scan(
			&s.ScheduleID, &s.ScheduleName, &s.WorkflowName, &s.WorkflowClassName,
			&s.Schedule, &s.Status, &lastFired,
			&s.CronTimezone, &s.QueueName, &s.AutomaticBackfill,
		); err != nil {
			return nil, fmt.Errorf("dbosui: scan schedule: %w", err)
		}
		if lastFired != nil {
			s.LastFiredAt = *lastFired
		}
		schedules = append(schedules, s)
	}
	return schedules, nil
}

// ListNotifications queries the dbos.notifications table — the inbox of
// messages sent via dbos.Send and awaiting consumption by dbos.Recv.
func (c *DBOSClient) ListNotifications(ctx context.Context, filter NotificationsFilter) (*NotificationsResult, error) {
	where := "WHERE 1=1"
	var args []any
	argIdx := 1

	if filter.DestinationWorkflowID != "" {
		where += fmt.Sprintf(" AND destination_uuid = $%d", argIdx)
		args = append(args, filter.DestinationWorkflowID)
		argIdx++
	}
	if filter.Topic != "" {
		where += fmt.Sprintf(" AND topic = $%d", argIdx)
		args = append(args, filter.Topic)
		argIdx++
	}

	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s.notifications %s", c.schema, where)
	var total int
	if err := c.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("dbosui: count notifications: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}

	dataQuery := fmt.Sprintf(
		`SELECT destination_uuid, COALESCE(topic,''), COALESCE(message,''), created_at_epoch_ms
		 FROM %s.notifications %s
		 ORDER BY created_at_epoch_ms DESC
		 LIMIT $%d OFFSET $%d`,
		c.schema, where, argIdx, argIdx+1,
	)
	args = append(args, limit, filter.Offset)

	rows, err := c.pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("dbosui: query notifications: %w", err)
	}
	defer rows.Close()

	var notifications []Notification
	for rows.Next() {
		var n Notification
		var rawMessage string
		var createdAtMs int64
		if err := rows.Scan(&n.DestinationWorkflowID, &n.Topic, &rawMessage, &createdAtMs); err != nil {
			return nil, fmt.Errorf("dbosui: scan notification: %w", err)
		}
		n.Message = decodeDBOSValue(rawMessage)
		n.CreatedAt = time.UnixMilli(createdAtMs)
		notifications = append(notifications, n)
	}
	return &NotificationsResult{Notifications: notifications, Total: total}, nil
}

// GetActivity returns per-hour workflow counts over the last `hours` hours,
// in chronological order. Each bucket is one hour wide, ending at the hour
// boundary at or after now. Counts are grouped by status.
func (c *DBOSClient) GetActivity(ctx context.Context, hours int) ([]ActivityBucket, error) {
	if hours <= 0 {
		hours = 24
	}
	now := time.Now().Truncate(time.Hour).Add(time.Hour)
	cutoff := now.Add(-time.Duration(hours) * time.Hour)

	query := fmt.Sprintf(
		`SELECT
		   (created_at / 3600000)::bigint AS bucket_hour_epoch,
		   status,
		   COUNT(*)
		 FROM %s.workflow_status
		 WHERE created_at >= $1
		 GROUP BY bucket_hour_epoch, status`,
		c.schema,
	)
	rows, err := c.pool.Query(ctx, query, cutoff.UnixMilli())
	if err != nil {
		return nil, fmt.Errorf("dbosui: query activity: %w", err)
	}
	defer rows.Close()

	buckets := make([]ActivityBucket, hours)
	for i := range buckets {
		buckets[i].EndTime = now.Add(-time.Duration(hours-1-i) * time.Hour)
	}

	for rows.Next() {
		var bucketHourEpoch int64
		var status string
		var count int
		if err := rows.Scan(&bucketHourEpoch, &status, &count); err != nil {
			return nil, fmt.Errorf("dbosui: scan activity: %w", err)
		}
		bucketEnd := time.Unix(0, 0).Add(time.Duration(bucketHourEpoch+1) * time.Hour)
		idx := int(bucketEnd.Sub(cutoff) / time.Hour) - 1
		if idx < 0 || idx >= hours {
			continue
		}
		b := &buckets[idx]
		b.Total += count
		switch WorkflowStatus(status) {
		case StatusPending, StatusEnqueued:
			b.Pending += count
		case StatusSuccess:
			b.Success += count
		case StatusError, StatusRetries:
			b.Failed += count
		case StatusCancelled:
			b.Cancelled += count
		}
	}
	return buckets, nil
}

// ListQueueStats returns per-queue rollup counts grouped by status, ordered
// by queue name.
func (c *DBOSClient) ListQueueStats(ctx context.Context) ([]QueueStats, error) {
	query := fmt.Sprintf(
		`SELECT COALESCE(queue_name, ''), status, COUNT(*)
		 FROM %s.workflow_status
		 GROUP BY queue_name, status
		 ORDER BY queue_name`,
		c.schema,
	)
	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("dbosui: query queue stats: %w", err)
	}
	defer rows.Close()

	byQueue := make(map[string]*QueueStats)
	order := []string{}
	for rows.Next() {
		var q, status string
		var count int
		if err := rows.Scan(&q, &status, &count); err != nil {
			return nil, fmt.Errorf("dbosui: scan queue stats: %w", err)
		}
		stat, ok := byQueue[q]
		if !ok {
			stat = &QueueStats{QueueName: q}
			byQueue[q] = stat
			order = append(order, q)
		}
		stat.Total += count
		switch WorkflowStatus(status) {
		case StatusPending:
			stat.Pending += count
		case StatusEnqueued:
			stat.Enqueued += count
		case StatusSuccess:
			stat.Success += count
		case StatusError, StatusRetries:
			stat.Failed += count
		case StatusCancelled:
			stat.Cancelled += count
		}
	}

	result := make([]QueueStats, 0, len(order))
	for _, q := range order {
		result = append(result, *byQueue[q])
	}
	return result, nil
}

// ListDistinctValues returns distinct non-empty values for the given
// workflow_status column, sorted alphabetically. Used to populate filter
// dropdowns (workflow types, queues, executors, app versions, users).
func (c *DBOSClient) ListDistinctValues(ctx context.Context, field DistinctField) ([]string, error) {
	column, ok := distinctColumn(field)
	if !ok {
		return nil, fmt.Errorf("dbosui: unsupported distinct field %q", field)
	}
	query := fmt.Sprintf(
		"SELECT DISTINCT %s FROM %s.workflow_status WHERE %s IS NOT NULL AND %s <> '' ORDER BY %s",
		column, c.schema, column, column, column,
	)
	rows, err := c.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("dbosui: query distinct %s: %w", column, err)
	}
	defer rows.Close()

	var values []string
	for rows.Next() {
		var v string
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("dbosui: scan distinct %s: %w", column, err)
		}
		values = append(values, v)
	}
	return values, nil
}

// distinctColumn maps a DistinctField to its workflow_status column name.
// Returns ok=false for unsupported fields. The mapping is closed-set so the
// column is safe to interpolate into SQL.
func distinctColumn(field DistinctField) (string, bool) {
	switch field {
	case DistinctName:
		return "name", true
	case DistinctQueueName:
		return "queue_name", true
	case DistinctExecutorID:
		return "executor_id", true
	case DistinctApplicationVersion:
		return "application_version", true
	case DistinctAuthenticatedUser:
		return "authenticated_user", true
	}
	return "", false
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
			StepID:          s.StepID,
			Name:            s.StepName,
			Output:          s.Output,
			StartedAt:       s.StartedAt,
			CompletedAt:     s.CompletedAt,
			ChildWorkflowID: s.ChildWorkflowID,
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
