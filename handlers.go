package dbosui

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/laenen-partners/dsx/ds"
	"github.com/starfederation/datastar-go/datastar"
)

// filterSignals matches the Datastar signals on the workflow filter form.
type filterSignals struct {
	Status string `json:"status"`
	Name   string `json:"name"`
	Page   int    `json:"page"`
}

type workflowHandlers struct {
	client Client
}

func (h *workflowHandlers) list() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var signals filterSignals
		_ = ds.ReadSignals("wf_filter", r, &signals)

		filter := ListFilter{
			SortDesc: true,
			Limit:    25,
			Offset:   signals.Page * 25,
		}
		if signals.Status != "" {
			filter.Status = []WorkflowStatus{WorkflowStatus(signals.Status)}
		}
		if signals.Name != "" {
			filter.Name = signals.Name
		}

		result, err := h.client.ListWorkflows(r.Context(), filter)
		if err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Failed to list workflows: %v", err))
			return
		}

		sse := datastar.NewSSE(w, r)
		_ = ds.Send.Patch(sse, WorkflowTableBody(result.Workflows, signals.Page, result.Total))
	}
}

func (h *workflowHandlers) stats() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		result, err := h.client.ListWorkflows(r.Context(), ListFilter{Limit: 10000})
		if err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Failed to load stats: %v", err))
			return
		}

		stats := Stats{Total: result.Total}
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

		sse := datastar.NewSSE(w, r)
		_ = ds.Send.Patch(sse, StatsBar(stats))
	}
}

func (h *workflowHandlers) detail() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		wf, err := h.client.GetWorkflow(r.Context(), id)
		if err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Workflow not found: %v", err))
			return
		}

		steps, _ := h.client.GetWorkflowSteps(r.Context(), id)
		events, _ := h.client.GetWorkflowEvents(r.Context(), id)

		sse := datastar.NewSSE(w, r)
		_ = ds.Send.Drawer(sse, DetailContent(wf, steps, events))
	}
}

func (h *workflowHandlers) steps() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		steps, err := h.client.GetWorkflowSteps(r.Context(), id)
		if err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Failed to load steps: %v", err))
			return
		}

		sse := datastar.NewSSE(w, r)
		_ = ds.Send.Patch(sse, StepsTable(steps))
	}
}

func (h *workflowHandlers) cancel() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := h.client.CancelWorkflow(r.Context(), id); err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Failed to cancel: %v", err))
			return
		}
		sse := datastar.NewSSE(w, r)
		_ = ds.Send.HideDrawer(sse)
		_ = ds.Send.Toast(sse, ds.ToastSuccess, fmt.Sprintf("Workflow %s cancelled", id))
	}
}

func (h *workflowHandlers) resume() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := h.client.ResumeWorkflow(r.Context(), id); err != nil {
			sse := datastar.NewSSE(w, r)
			_ = ds.Send.Toast(sse, ds.ToastError, fmt.Sprintf("Failed to resume: %v", err))
			return
		}
		sse := datastar.NewSSE(w, r)
		_ = ds.Send.HideDrawer(sse)
		_ = ds.Send.Toast(sse, ds.ToastSuccess, fmt.Sprintf("Workflow %s resumed", id))
	}
}
