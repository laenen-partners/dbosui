package dbosui

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	dbosuiv1 "github.com/laenen-partners/dbosui/gen/go/dbosui/v1"
)

// workflowService implements dbosuiv1connect.WorkflowServiceHandler.
type workflowService struct {
	client Client
}

func (s *workflowService) ListWorkflows(ctx context.Context, req *connect.Request[dbosuiv1.ListWorkflowsRequest]) (*connect.Response[dbosuiv1.ListWorkflowsResponse], error) {
	msg := req.Msg

	filter := ListFilter{
		Name:               msg.GetName(),
		Limit:              int(msg.GetLimit()),
		Offset:             int(msg.GetOffset()),
		SortDesc:           msg.GetSortDesc(),
		User:               msg.GetUser(),
		IDPrefix:           msg.GetIdPrefix(),
		QueueName:          msg.GetQueueName(),
		ExecutorID:         msg.GetExecutorId(),
		ApplicationVersion: msg.GetApplicationVersion(),
	}
	for _, st := range msg.GetStatuses() {
		filter.Status = append(filter.Status, statusFromProto(st))
	}

	result, err := s.client.ListWorkflows(ctx, filter)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list workflows: %w", err))
	}

	out := &dbosuiv1.ListWorkflowsResponse{
		Total:     int32(result.Total),
		Workflows: make([]*dbosuiv1.Workflow, len(result.Workflows)),
	}
	for i, wf := range result.Workflows {
		out.Workflows[i] = workflowToProto(wf)
	}
	return connect.NewResponse(out), nil
}

func (s *workflowService) GetWorkflow(ctx context.Context, req *connect.Request[dbosuiv1.GetWorkflowRequest]) (*connect.Response[dbosuiv1.GetWorkflowResponse], error) {
	wf, err := s.client.GetWorkflow(ctx, req.Msg.GetId())
	if err != nil {
		return nil, connectError(err)
	}
	return connect.NewResponse(&dbosuiv1.GetWorkflowResponse{Workflow: workflowToProto(*wf)}), nil
}

func (s *workflowService) GetWorkflowSteps(ctx context.Context, req *connect.Request[dbosuiv1.GetWorkflowStepsRequest]) (*connect.Response[dbosuiv1.GetWorkflowStepsResponse], error) {
	steps, err := s.client.GetWorkflowSteps(ctx, req.Msg.GetId())
	if err != nil {
		return nil, connectError(err)
	}
	out := &dbosuiv1.GetWorkflowStepsResponse{Steps: make([]*dbosuiv1.Step, len(steps))}
	for i, s := range steps {
		out.Steps[i] = &dbosuiv1.Step{
			StepId:     int32(s.StepID),
			Name:       s.Name,
			OutputJson: jsonOrPassthrough(s.Output),
			Error:      s.Error,
		}
	}
	return connect.NewResponse(out), nil
}

func (s *workflowService) GetWorkflowEvents(ctx context.Context, req *connect.Request[dbosuiv1.GetWorkflowEventsRequest]) (*connect.Response[dbosuiv1.GetWorkflowEventsResponse], error) {
	events, err := s.client.GetWorkflowEvents(ctx, req.Msg.GetId())
	if err != nil {
		return nil, connectError(err)
	}
	out := &dbosuiv1.GetWorkflowEventsResponse{Events: make([]*dbosuiv1.Event, len(events))}
	for i, e := range events {
		out.Events[i] = &dbosuiv1.Event{Key: e.Key, Value: e.Value}
	}
	return connect.NewResponse(out), nil
}

func (s *workflowService) ListNotifications(ctx context.Context, req *connect.Request[dbosuiv1.ListNotificationsRequest]) (*connect.Response[dbosuiv1.ListNotificationsResponse], error) {
	msg := req.Msg
	result, err := s.client.ListNotifications(ctx, NotificationsFilter{
		DestinationWorkflowID: msg.GetDestinationWorkflowId(),
		Topic:                 msg.GetTopic(),
		Limit:                 int(msg.GetLimit()),
		Offset:                int(msg.GetOffset()),
	})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list notifications: %w", err))
	}
	out := &dbosuiv1.ListNotificationsResponse{
		Total:         int32(result.Total),
		Notifications: make([]*dbosuiv1.Notification, len(result.Notifications)),
	}
	for i, n := range result.Notifications {
		out.Notifications[i] = &dbosuiv1.Notification{
			DestinationWorkflowId: n.DestinationWorkflowID,
			Topic:                 n.Topic,
			Message:               n.Message,
			CreatedAt:             timestamppb.New(n.CreatedAt),
		}
	}
	return connect.NewResponse(out), nil
}

func (s *workflowService) ListQueueStats(ctx context.Context, _ *connect.Request[dbosuiv1.ListQueueStatsRequest]) (*connect.Response[dbosuiv1.ListQueueStatsResponse], error) {
	stats, err := s.client.ListQueueStats(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list queue stats: %w", err))
	}
	out := &dbosuiv1.ListQueueStatsResponse{Queues: make([]*dbosuiv1.QueueStats, len(stats))}
	for i, q := range stats {
		out.Queues[i] = &dbosuiv1.QueueStats{
			QueueName: q.QueueName,
			Total:     int32(q.Total),
			Pending:   int32(q.Pending),
			Enqueued:  int32(q.Enqueued),
			Success:   int32(q.Success),
			Failed:    int32(q.Failed),
			Cancelled: int32(q.Cancelled),
		}
	}
	return connect.NewResponse(out), nil
}

func (s *workflowService) ListDistinctValues(ctx context.Context, req *connect.Request[dbosuiv1.ListDistinctValuesRequest]) (*connect.Response[dbosuiv1.ListDistinctValuesResponse], error) {
	field, ok := distinctFieldFromProto(req.Msg.GetField())
	if !ok {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("unknown workflow field"))
	}
	values, err := s.client.ListDistinctValues(ctx, field)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list distinct values: %w", err))
	}
	return connect.NewResponse(&dbosuiv1.ListDistinctValuesResponse{Values: values}), nil
}

func distinctFieldFromProto(f dbosuiv1.WorkflowField) (DistinctField, bool) {
	switch f {
	case dbosuiv1.WorkflowField_WORKFLOW_FIELD_NAME:
		return DistinctName, true
	case dbosuiv1.WorkflowField_WORKFLOW_FIELD_QUEUE_NAME:
		return DistinctQueueName, true
	case dbosuiv1.WorkflowField_WORKFLOW_FIELD_EXECUTOR_ID:
		return DistinctExecutorID, true
	case dbosuiv1.WorkflowField_WORKFLOW_FIELD_APPLICATION_VERSION:
		return DistinctApplicationVersion, true
	case dbosuiv1.WorkflowField_WORKFLOW_FIELD_AUTHENTICATED_USER:
		return DistinctAuthenticatedUser, true
	}
	return "", false
}

func (s *workflowService) GetStats(ctx context.Context, _ *connect.Request[dbosuiv1.GetStatsRequest]) (*connect.Response[dbosuiv1.GetStatsResponse], error) {
	result, err := s.client.ListWorkflows(ctx, ListFilter{Limit: 10000})
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("stats: %w", err))
	}
	stats := &dbosuiv1.Stats{Total: int32(result.Total)}
	for _, wf := range result.Workflows {
		switch wf.Status {
		case StatusPending, StatusEnqueued:
			stats.Pending++
		case StatusSuccess:
			stats.Success++
		case StatusError, StatusRetries:
			stats.Failed++
		case StatusCancelled:
			stats.Cancelled++
		}
	}
	return connect.NewResponse(&dbosuiv1.GetStatsResponse{Stats: stats}), nil
}

func (s *workflowService) CancelWorkflow(ctx context.Context, req *connect.Request[dbosuiv1.CancelWorkflowRequest]) (*connect.Response[dbosuiv1.CancelWorkflowResponse], error) {
	if err := s.client.CancelWorkflow(ctx, req.Msg.GetId()); err != nil {
		return nil, connectError(err)
	}
	return connect.NewResponse(&dbosuiv1.CancelWorkflowResponse{}), nil
}

func (s *workflowService) ResumeWorkflow(ctx context.Context, req *connect.Request[dbosuiv1.ResumeWorkflowRequest]) (*connect.Response[dbosuiv1.ResumeWorkflowResponse], error) {
	if err := s.client.ResumeWorkflow(ctx, req.Msg.GetId()); err != nil {
		return nil, connectError(err)
	}
	return connect.NewResponse(&dbosuiv1.ResumeWorkflowResponse{}), nil
}

func (s *workflowService) DeleteWorkflow(ctx context.Context, req *connect.Request[dbosuiv1.DeleteWorkflowRequest]) (*connect.Response[dbosuiv1.DeleteWorkflowResponse], error) {
	if err := s.client.DeleteWorkflow(ctx, req.Msg.GetId()); err != nil {
		return nil, connectError(err)
	}
	return connect.NewResponse(&dbosuiv1.DeleteWorkflowResponse{}), nil
}

func workflowToProto(wf WorkflowInfo) *dbosuiv1.Workflow {
	return &dbosuiv1.Workflow{
		Id:                 wf.ID,
		Status:             statusToProto(wf.Status),
		Name:               wf.Name,
		AuthenticatedUser:  wf.AuthenticatedUser,
		InputJson:          jsonOrPassthrough(wf.Input),
		OutputJson:         jsonOrPassthrough(wf.Output),
		Error:              wf.Error,
		CreatedAt:          timestamppb.New(wf.CreatedAt),
		UpdatedAt:          timestamppb.New(wf.UpdatedAt),
		ApplicationVersion: wf.ApplicationVersion,
		ApplicationId:      wf.ApplicationID,
		QueueName:          wf.QueueName,
		Attempts:           int32(wf.Attempts),
		ExecutorId:         wf.ExecutorID,
	}
}

func statusToProto(s WorkflowStatus) dbosuiv1.WorkflowStatus {
	switch s {
	case StatusPending:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_PENDING
	case StatusEnqueued:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_ENQUEUED
	case StatusSuccess:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_SUCCESS
	case StatusError:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_ERROR
	case StatusCancelled:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED
	case StatusRetries:
		return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_MAX_RETRIES_EXCEEDED
	}
	return dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_UNSPECIFIED
}

func statusFromProto(s dbosuiv1.WorkflowStatus) WorkflowStatus {
	switch s {
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_PENDING:
		return StatusPending
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_ENQUEUED:
		return StatusEnqueued
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_SUCCESS:
		return StatusSuccess
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_ERROR:
		return StatusError
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_CANCELLED:
		return StatusCancelled
	case dbosuiv1.WorkflowStatus_WORKFLOW_STATUS_MAX_RETRIES_EXCEEDED:
		return StatusRetries
	}
	return ""
}

// jsonOrPassthrough turns an arbitrary input/output value into a JSON string.
// DBOS often stores values as base64-encoded JSON strings; if v is already a string
// we return it as-is so the SPA can decode/pretty-print it.
func jsonOrPassthrough(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

// connectError maps backend errors to Connect codes. "not found" → NotFound, otherwise Internal.
func connectError(err error) error {
	var notFound interface{ NotFound() bool }
	if errors.As(err, &notFound) && notFound.NotFound() {
		return connect.NewError(connect.CodeNotFound, err)
	}
	// Fallback: best-effort string match for the existing "not found" sentinel.
	if err != nil && containsNotFound(err.Error()) {
		return connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewError(connect.CodeInternal, err)
}

func containsNotFound(s string) bool {
	for i := 0; i+9 <= len(s); i++ {
		if s[i:i+9] == "not found" {
			return true
		}
	}
	return false
}
